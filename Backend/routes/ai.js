const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');

const router = express.Router();

const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.VITE_OPENAI_API_KEY;
const DEEPSEEK_API_KEY = process.env.VITE_DEEPSEEK_API_KEY;

// Clean markdown from LLM
const cleanResponse = (text) => text.replace(/```json/g, "").replace(/```/g, "").trim();

// Providers Initialization
const geminiClient = new GoogleGenerativeAI(GEMINI_API_KEY);
const geminiModel = geminiClient.getGenerativeModel({
    model: "gemini-flash-latest",
    generationConfig: { responseMimeType: "application/json" },
});

const openaiClient = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
const deepseekClient = DEEPSEEK_API_KEY ? new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey: DEEPSEEK_API_KEY }) : null;

const OPENAI_MODEL = process.env.VITE_OPENAI_MODEL || "gpt-4o-mini";
const DEEPSEEK_MODEL = process.env.VITE_DEEPSEEK_MODEL || "deepseek-chat";

// Universal Generate Function
const generateContent = async (provider, prompt) => {
    if (provider === 'openai') {
        if (!openaiClient) throw new Error("OpenAI API Key not configured");
        const completion = await openaiClient.chat.completions.create({
            messages: [
                { role: "system", content: "You are a helpful educational assistant. Output strictly valid JSON." },
                { role: "user", content: prompt }
            ],
            model: OPENAI_MODEL,
            response_format: { type: "json_object" },
        });
        return JSON.parse(cleanResponse(completion.choices[0].message.content));
    } else if (provider === 'deepseek') {
        if (!deepseekClient) throw new Error("Deepseek API Key not configured");
        const completion = await deepseekClient.chat.completions.create({
            messages: [
                { role: "system", content: "You are a helpful educational assistant. Output strictly valid JSON." },
                { role: "user", content: prompt }
            ],
            model: DEEPSEEK_MODEL,
            response_format: { type: "json_object" },
        });
        return JSON.parse(cleanResponse(completion.choices[0].message.content));
    } else {
        // Fallback or explicit gemini
        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        return JSON.parse(cleanResponse(response.text()));
    }
};

// Protect wrapper
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// POST /api/ai/generate
router.post('/generate', asyncRoute(async (req, res) => {
    const { provider, prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });
    
    // Using a light retry pattern on the backend
    let lastError;
    for (let i = 0; i < 3; i++) {
        try {
            const data = await generateContent(provider || 'gemini', prompt);
            return res.json(data);
        } catch (err) {
            lastError = err;
            if (err.message?.includes('503') || err.status === 429) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }
            break;
        }
    }
    console.error("Backend LLM Error:", lastError);
    res.status(500).json({ error: "Failed to generate AI content" });
}));

module.exports = router;
