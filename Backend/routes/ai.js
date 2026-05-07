const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');

const router = express.Router();

const GEMINI_API_KEY   = process.env.VITE_GEMINI_API_KEY;
const OPENAI_API_KEY   = process.env.VITE_OPENAI_API_KEY;
const DEEPSEEK_API_KEY = process.env.VITE_DEEPSEEK_API_KEY;

// ── Finetuned model server URLs ────────────────────────────────────────────────
//
// Set these in .env after running: modal deploy modal_server.py
// Modal prints the URLs on deploy. They look like:
//   https://<workspace>--piab-inference-inferenceserver-ask.modal.run
//   https://<workspace>--piab-inference-inferenceserver-ask-stream.modal.run
//
// FINETUNED_ASK_URL    — batch endpoint (returns full JSON when done)
// FINETUNED_STREAM_URL — SSE streaming endpoint (tokens appear as generated)
//
// Fallbacks point to the local FastAPI server (server.py on port 8001).
const FINETUNED_ASK_URL    = process.env.FINETUNED_ASK_URL    || 'http://localhost:8001/ask';
const FINETUNED_STREAM_URL = process.env.FINETUNED_STREAM_URL || 'http://localhost:8001/ask-stream';

// How long to wait before falling back to DeepSeek API.
// DeepSeek R1 reasoning traces can run 60-90s — 120s gives it room.
const FINETUNED_TIMEOUT_MS = parseInt(process.env.FINETUNED_TIMEOUT_MS || '120000', 10);

// ── API provider clients ───────────────────────────────────────────────────────
const geminiClient = new GoogleGenerativeAI(GEMINI_API_KEY);
const geminiModel  = geminiClient.getGenerativeModel({
    model: 'gemini-flash-latest',
    generationConfig: { responseMimeType: 'application/json' },
});

const openaiClient   = OPENAI_API_KEY   ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
const deepseekClient = DEEPSEEK_API_KEY ? new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey: DEEPSEEK_API_KEY }) : null;

const OPENAI_MODEL   = process.env.VITE_OPENAI_MODEL   || 'gpt-4o-mini';
const DEEPSEEK_MODEL = process.env.VITE_DEEPSEEK_MODEL || 'deepseek-chat';

const cleanResponse = (text) => text.replace(/```json/g, '').replace(/```/g, '').trim();

// ── Finetuned server helpers ───────────────────────────────────────────────────

const isFinetuned = (p) => p === 'finetuned-deepseek' || p === 'finetuned-mistral';
const ftModelName = (p) => p === 'finetuned-deepseek' ? 'deepseek' : 'mistral';

// Batch call — waits for full answer, returns plain text string
const callFinetunedBatch = async (modelName, question) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FINETUNED_TIMEOUT_MS);
    try {
        const resp = await fetch(FINETUNED_ASK_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ question, model: modelName }),
            signal:  controller.signal,
        });
        clearTimeout(timer);
        if (!resp.ok) throw new Error(`Finetuned server HTTP ${resp.status}`);
        const data = await resp.json();
        console.log(`[Finetuned] ${modelName} answered in ${data.latency_ms}ms`);
        return data.answer;
    } catch (err) {
        clearTimeout(timer);
        if (err.name === 'AbortError') throw new Error(`TIMEOUT:finetuned-${modelName}`);
        throw err;
    }
};

// SSE streaming — reads Modal SSE chunks and writes plain text tokens to res.
// If the endpoint returns plain JSON (old Modal deployment without /ask-stream),
// it detects this from Content-Type and falls back to writing the full answer at once.
const pipeFinetunedStream = async (modelName, question, res) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FINETUNED_TIMEOUT_MS);
    try {
        const resp = await fetch(FINETUNED_STREAM_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ question, model: modelName }),
            signal:  controller.signal,
        });
        clearTimeout(timer);
        if (!resp.ok) throw new Error(`Finetuned stream HTTP ${resp.status}`);

        // Old Modal deployment returns JSON, not SSE — detect and handle gracefully
        const contentType = resp.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const data = await resp.json();
            if (data.answer) res.write(data.answer);
            return;
        }

        const reader  = resp.body.getReader();
        const decoder = new TextDecoder();
        let   buffer  = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop(); // hold incomplete last line

            for (const line of lines) {
                if (!line.startsWith('data:')) continue;
                const raw = line.slice(5).trim();
                if (raw === '[DONE]') return;
                try {
                    const obj = JSON.parse(raw);
                    if (obj.token) res.write(obj.token);
                } catch (_) {}
            }
        }
    } catch (err) {
        clearTimeout(timer);
        if (err.name === 'AbortError') throw new Error(`TIMEOUT:finetuned-${modelName}`);
        throw err;
    }
};

const isTimeoutOrDown = (err) =>
    err.message.startsWith('TIMEOUT') || 
    err.message.includes('ECONNREFUSED') ||
    err.message.includes('fetch failed') ||
    err.message.startsWith('Finetuned server HTTP');

// Fall back to DeepSeek API stream when finetuned server is slow/down
const fallbackToDeepSeekStream = async (prompt, res) => {
    if (!deepseekClient) throw new Error('Finetuned unavailable and DEEPSEEK_API_KEY not set');
    console.warn('[Finetuned] Falling back to DeepSeek API stream');
    const stream = await deepseekClient.chat.completions.create({
        model: DEEPSEEK_MODEL, messages: [{ role: 'user', content: prompt }], stream: true,
    });
    for await (const chunk of stream) res.write(chunk.choices[0]?.delta?.content || '');
};

// ── Universal batch generate (returns parsed JSON object) ─────────────────────
const generateContent = async (provider, prompt) => {
    if (provider === 'openai') {
        if (!openaiClient) throw new Error('OpenAI API Key not configured');
        const c = await openaiClient.chat.completions.create({
            messages: [
                { role: 'system', content: 'You are a helpful educational assistant. Output strictly valid JSON.' },
                { role: 'user',   content: prompt },
            ],
            model: OPENAI_MODEL,
            response_format: { type: 'json_object' },
        });
        return JSON.parse(cleanResponse(c.choices[0].message.content));

    } else if (provider === 'deepseek') {
        if (!deepseekClient) throw new Error('DeepSeek API Key not configured');
        const c = await deepseekClient.chat.completions.create({
            messages: [
                { role: 'system', content: 'You are a helpful educational assistant. Output strictly valid JSON.' },
                { role: 'user',   content: prompt },
            ],
            model: DEEPSEEK_MODEL,
            response_format: { type: 'json_object' },
        });
        return JSON.parse(cleanResponse(c.choices[0].message.content));

    } else if (isFinetuned(provider)) {
        try {
            const answer = await callFinetunedBatch(ftModelName(provider), prompt);
            try { return JSON.parse(cleanResponse(answer)); } catch (_) {}
            return { answer };
        } catch (err) {
            if (isTimeoutOrDown(err)) {
                console.warn(`[Finetuned batch] ${err.message} — falling back to DeepSeek API`);
                if (!deepseekClient) throw new Error('Finetuned unavailable and DEEPSEEK_API_KEY not set');
                const c = await deepseekClient.chat.completions.create({
                    messages: [
                        { role: 'system', content: 'You are a helpful educational assistant. Output strictly valid JSON.' },
                        { role: 'user',   content: prompt },
                    ],
                    model: DEEPSEEK_MODEL,
                    response_format: { type: 'json_object' },
                });
                return JSON.parse(cleanResponse(c.choices[0].message.content));
            }
            throw err;
        }

    } else {
        // Default: Gemini
        const result = await geminiModel.generateContent(prompt);
        return JSON.parse(cleanResponse((await result.response).text()));
    }
};

// ── Shared utils ───────────────────────────────────────────────────────────────
const asyncRoute  = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const vectorDb    = require('../services/vectorDb');
const { requireAuth } = require('../middleware/auth');

const openChunkedStream = (res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();
    res.write(' '); // immediately trigger the browser's reader
};

const streamErrMsg = (err) => err.message?.includes('429')
    ? 'AI quota exceeded. Please try again in a few seconds.'
    : 'Connection error while streaming AI response.';

// ── POST /api/ai/generate ──────────────────────────────────────────────────────
router.post('/generate', asyncRoute(async (req, res) => {
    const { provider, prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    let lastError;
    for (let i = 0; i < 3; i++) {
        try {
            return res.json(await generateContent(provider || 'gemini', prompt));
        } catch (err) {
            lastError = err;
            if (err.message?.includes('503') || err.status === 429) {
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }
            break;
        }
    }
    console.error('Backend LLM Error:', lastError);
    res.status(500).json({ error: 'Failed to generate AI content', details: lastError?.message });
}));

// ── POST /api/ai/ask-rag ───────────────────────────────────────────────────────
router.post('/ask-rag', requireAuth, asyncRoute(async (req, res) => {
    const { provider, question } = req.body;
    if (!question) return res.status(400).json({ error: 'Missing question' });

    const context = await vectorDb.queryMemory(req.user.userId, question, 5);

    const prompt = `
Student Question: "${question}"

You are an expert personalized tutor with access to the student's uploaded learning materials.

PAST KNOWLEDGE / DOCUMENT CONTEXT:
${context ? `"""\n${context}\n"""` : 'No specific context found. Rely on general AI knowledge.'}

INSTRUCTION: Answer accurately. Prioritize the PAST KNOWLEDGE context with direct citations where relevant.
Return a JSON object with key "answer" containing your markdown response.
`;

    let lastError;
    for (let i = 0; i < 3; i++) {
        try {
            return res.json(await generateContent(provider || 'gemini', prompt));
        } catch (err) {
            lastError = err;
            if (err.message?.includes('503') || err.status === 429) {
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }
            break;
        }
    }
    console.error('Backend LLM Error:', lastError);
    res.status(500).json({ error: 'Failed to generate AI content', details: lastError?.message });
}));

// ── POST /api/ai/stream-generate ──────────────────────────────────────────────
router.post('/stream-generate', asyncRoute(async (req, res) => {
    const { provider, prompt } = req.body;
    if (!prompt) return res.status(400).end();

    openChunkedStream(res);

    try {
        if (provider === 'openai') {
            if (!openaiClient) throw new Error('OpenAI API Key not configured');
            const stream = await openaiClient.chat.completions.create({
                model: OPENAI_MODEL, messages: [{ role: 'user', content: prompt }], stream: true,
            });
            for await (const chunk of stream) res.write(chunk.choices[0]?.delta?.content || '');

        } else if (provider === 'deepseek') {
            if (!deepseekClient) throw new Error('DeepSeek API Key not configured');
            const stream = await deepseekClient.chat.completions.create({
                model: DEEPSEEK_MODEL, messages: [{ role: 'user', content: prompt }], stream: true,
            });
            for await (const chunk of stream) res.write(chunk.choices[0]?.delta?.content || '');

        } else if (isFinetuned(provider)) {
            try {
                await pipeFinetunedStream(ftModelName(provider), prompt, res);
            } catch (err) {
                if (isTimeoutOrDown(err)) await fallbackToDeepSeekStream(prompt, res);
                else throw err;
            }

        } else {
            const m = geminiClient.getGenerativeModel({ model: 'gemini-flash-latest' });
            const r = await m.generateContentStream(prompt);
            for await (const chunk of r.stream) res.write(chunk.text());
        }
        res.end();

    } catch (err) {
        console.error('[stream-generate] Error:', err.message);
        res.write(`\n\n*[Error: ${streamErrMsg(err)}]*`);
        res.end();
    }
}));

// ── POST /api/ai/stream-rag ────────────────────────────────────────────────────
router.post('/stream-rag', requireAuth, asyncRoute(async (req, res) => {
    const { provider, question } = req.body;
    if (!question) return res.status(400).end();

    console.log(`[stream-rag] user=${req.user.userId} provider=${provider}`);
    openChunkedStream(res);

    try {
        let context = '';
        try {
            context = await vectorDb.queryMemory(req.user.userId, question, 5);
            console.log(`[stream-rag] VectorDB: ${context.length} chars`);
        } catch (e) {
            console.error('[stream-rag] VectorDB error:', e.message);
        }

        const fullPrompt = `
Student Question: "${question}"

You are an expert personalized tutor with access to the student's uploaded learning materials.

PAST KNOWLEDGE / DOCUMENT CONTEXT:
${context ? `"""\n${context}\n"""` : 'No specific context found. Rely on general AI knowledge.'}

INSTRUCTION: Answer accurately in markdown. Prioritize the PAST KNOWLEDGE context with direct citations where relevant.
DO NOT wrap in JSON or code fences.
`;

        if (provider === 'openai') {
            if (!openaiClient) throw new Error('OpenAI API Key not configured');
            const stream = await openaiClient.chat.completions.create({
                model: OPENAI_MODEL, messages: [{ role: 'user', content: fullPrompt }], stream: true,
            });
            for await (const chunk of stream) res.write(chunk.choices[0]?.delta?.content || '');

        } else if (provider === 'deepseek') {
            if (!deepseekClient) throw new Error('DeepSeek API Key not configured');
            const stream = await deepseekClient.chat.completions.create({
                model: DEEPSEEK_MODEL, messages: [{ role: 'user', content: fullPrompt }], stream: true,
            });
            for await (const chunk of stream) res.write(chunk.choices[0]?.delta?.content || '');

        } else if (isFinetuned(provider)) {
            // Inject retrieved context directly into the question for the finetuned model
            const ragQuestion = context
                ? `Context from my notes:\n${context}\n\nQuestion: ${question}`
                : question;
            try {
                await pipeFinetunedStream(ftModelName(provider), ragQuestion, res);
            } catch (err) {
                if (isTimeoutOrDown(err)) await fallbackToDeepSeekStream(fullPrompt, res);
                else throw err;
            }

        } else {
            const m = geminiClient.getGenerativeModel({ model: 'gemini-flash-latest' });
            const r = await m.generateContentStream(fullPrompt);
            for await (const chunk of r.stream) res.write(chunk.text());
        }

        res.end();
        console.log('[stream-rag] Done');

    } catch (err) {
        console.error('[stream-rag] Error:', err.message);
        res.write(`\n\n*[Error: ${streamErrMsg(err)}]*`);
        res.end();
    }
}));

module.exports = router;
