const express = require('express');
const { ensureModel, MLX_PORT } = require('../services/mlxManager');

const router = express.Router();

// Clean markdown from LLM and extract JSON
const cleanResponse = (text) => {
    if (typeof text !== 'string') return '';
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
        return match[0];
    }
    return text.replace(/```json/g, "").replace(/```/g, "").trim();
};

// Universal Generate Function pointing to local MLX server
const generateContent = async (complexity, prompt) => {
    await ensureModel(complexity);
    
    const response = await fetch(`http://localhost:${MLX_PORT}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages: [
                { role: "system", content: "You are a helpful educational assistant. Output strictly valid JSON." },
                { role: "user", content: prompt }
            ],
            max_tokens: 4096
        }),
        signal: AbortSignal.timeout(900000) // 15 minutes
    });

    if (!response.ok) {
        throw new Error(`MLX Local Server Error: ${response.statusText}`);
    }

    const completion = await response.json();
    console.log("[DEBUG] MLX Server Response:", JSON.stringify(completion, null, 2));
    const content = completion.choices?.[0]?.message?.content || "";
    return JSON.parse(cleanResponse(content) || "{}");
};

// Protect wrapper
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// POST /api/ai/generate
router.post('/generate', asyncRoute(async (req, res) => {
    // The frontend should pass 'complexity' (low, medium, high)
    const { complexity = 'medium', prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });
    
    // Using a light retry pattern on the backend
    let lastError;
    for (let i = 0; i < 3; i++) {
        try {
            const data = await generateContent(complexity, prompt);
            return res.json(data);
        } catch (err) {
            lastError = err;
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
        }
    }
    console.error("Backend LLM Error:", lastError);
    res.status(500).json({ error: "Failed to generate AI content", details: lastError ? lastError.message : "Unknown error" });
}));

const vectorDb = require('../services/vectorDb');
const { requireAuth } = require('../middleware/auth');

// POST /api/ai/ask-rag
router.post('/ask-rag', requireAuth, asyncRoute(async (req, res) => {
    // RAG is typically medium/high complexity
    const { complexity = 'high', question } = req.body;
    if (!question) return res.status(400).json({ error: "Missing question" });

    // 1. Retrieve historical context from ChromaDB
    const context = await vectorDb.queryMemory(req.user.userId, question, 5);

    // 2. Synthesize prompt
    let prompt = `
Student Question: "${question}"

You are an expert personalized tutor possessing the student's exact learning memory and resources.
Below is the highly relevant contextual information extracted from the exact files the student previously uploaded.

PAST KNOWLEDGE / DOCUMENT CONTEXT:
${context ? `"""\n${context}\n"""` : "No specific relevant memory found in the database. Rely on general AI knowledge."}

INSTRUCTION: Answer the student's question accurately. If the PAST KNOWLEDGE contains the answer, deeply prioritize it with direct citations or mentions of the context. If it does not contain the answer, answer generally and helpfully.
Return as a JSON object with a key "answer" containing your raw markdown response.
`;

    // 3. Generate response using native tools
    let lastError;
    for (let i = 0; i < 3; i++) {
        try {
            const data = await generateContent(complexity, prompt);
            return res.json(data);
        } catch (err) {
            lastError = err;
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
        }
    }
    console.error("Backend LLM Error:", lastError);
    res.status(500).json({ error: "Failed to generate AI content", details: lastError ? lastError.message : "Unknown error" });
}));

// POST /api/ai/stream-generate - Universal generic streaming endpoint for UI elements
router.post('/stream-generate', asyncRoute(async (req, res) => {
    const { complexity = 'medium', prompt } = req.body;
    if (!prompt) return res.status(400).end();

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();
    res.write(" ");

    try {
        await ensureModel(complexity);

        const response = await fetch(`http://localhost:${MLX_PORT}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{ role: 'user', content: prompt }],
                stream: true,
                max_tokens: 4096
            }),
            signal: AbortSignal.timeout(900000)
        });

        if (!response.ok) {
            throw new Error(`MLX Local Server Error: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.choices[0].delta.content) {
                            res.write(parsed.choices[0].delta.content);
                        }
                    } catch (e) {
                        // ignore unparseable chunk
                    }
                }
            }
        }
        res.end();
    } catch (err) {
        console.error("Streaming error:", err);
        res.write(`\n\n*[Error: Local Model generation failed]*`);
        res.end();
    }
}));

// POST /api/ai/stream-rag - Streaming SSE endpoint for Chatbots
router.post('/stream-rag', requireAuth, asyncRoute(async (req, res) => {
    const { complexity = 'high', question } = req.body;
    if (!question) return res.status(400).end();

    console.log(`[Stream API] Initiating request for user ${req.user.userId}`);
    
    // Setup headers for standard Text streaming
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders(); 
    res.write(" ");

    try {
        let context = "";
        try {
            console.log(`[Stream API] Querying VectorDB memory for context...`);
            context = await vectorDb.queryMemory(req.user.userId, question, 5);
            console.log(`[Stream API] VectorDB retrieved ${context.length} characters of context.`);
        } catch (dbErr) {
            console.error("[Stream API] Vector DB fetch failed during stream:", dbErr);
        }

        let prompt = `
Student Question: "${question}"

You are an expert personalized tutor possessing the student's exact learning memory and resources.
Below is the highly relevant contextual information extracted from the exact files the student previously uploaded.

PAST KNOWLEDGE / DOCUMENT CONTEXT:
${context ? `"""\n${context}\n"""` : "No specific relevant memory found in the database. Rely on general AI knowledge."}

INSTRUCTION: Answer the student's question accurately. If the PAST KNOWLEDGE contains the answer, deeply prioritize it with direct citations or mentions of the context. 
IMPORTANT: Stream directly in markdown. DO NOT wrap with \`\`\`json or output JSON objects.
`;      
        console.log(`[Stream API] Synthesized complete LLM prompt.`);
        
        await ensureModel(complexity);
        
        let byteCount = 0;
        const response = await fetch(`http://localhost:${MLX_PORT}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{ role: 'user', content: prompt }],
                stream: true
            }),
            signal: AbortSignal.timeout(900000)
        });

        if (!response.ok) {
            throw new Error(`MLX Local Server Error: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.choices[0].delta.content) {
                            const textChunk = parsed.choices[0].delta.content;
                            byteCount += textChunk.length;
                            res.write(textChunk);
                        }
                    } catch (e) {
                        // ignore
                    }
                }
            }
        }

        res.end();
        console.log(`[Stream API] Successfully finished stream. Piped ${byteCount} bytes.`);
    } catch (err) {
        console.error("[Stream API] Uncaught streaming error:", err);
        res.write(`\n\n*[Error: Local Model generation failed]*`);
        res.end();
    }
}));

module.exports = router;
