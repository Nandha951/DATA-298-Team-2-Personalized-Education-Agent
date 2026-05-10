const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');

const router = express.Router();

// ── Finetuned model server URLs ────────────────────────────────────────────────
const FINETUNED_ASK_URL    = process.env.FINETUNED_ASK_URL    || 'http://localhost:8001/ask';
const FINETUNED_STREAM_URL = process.env.FINETUNED_STREAM_URL || 'http://localhost:8001/ask-stream';
const FINETUNED_HEALTH_URL = process.env.FINETUNED_HEALTH_URL || null;
const FINETUNED_CONFIG_URL = process.env.FINETUNED_CONFIG_URL || null;
const FINETUNED_TIMEOUT_MS = parseInt(process.env.FINETUNED_TIMEOUT_MS || '120000', 10);

const OPENAI_MODEL   = process.env.VITE_OPENAI_MODEL   || 'gpt-4o-mini';
const DEEPSEEK_MODEL = process.env.VITE_DEEPSEEK_MODEL || 'deepseek-chat';

// ── API keys — loaded from env, then topped-up from Modal /config if available ─
let _keys = {
    gemini:   process.env.VITE_GEMINI_API_KEY   || '',
    openai:   process.env.VITE_OPENAI_API_KEY   || '',
    deepseek: process.env.VITE_DEEPSEEK_API_KEY || '',
};

// Fetch fresh keys from Modal secret store (non-blocking, best-effort)
const refreshKeys = async () => {
    if (!FINETUNED_CONFIG_URL) return;
    try {
        const res = await fetch(FINETUNED_CONFIG_URL, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return;
        const data = await res.json();
        if (data.GEMINI_API_KEY)  _keys.gemini   = data.GEMINI_API_KEY;
        if (data.OPENAI_API_KEY)  _keys.openai   = data.OPENAI_API_KEY;
        if (data.DEEPSEEK_API_KEY) _keys.deepseek = data.DEEPSEEK_API_KEY;
        console.log('[AI] Keys refreshed from Modal config. gemini=' + !!_keys.gemini + ' openai=' + !!_keys.openai);
    } catch (e) {
        console.warn('[AI] Could not fetch Modal config:', e.message);
    }
};

// Refresh at startup and every 10 min (keys rotate without redeploy)
refreshKeys();
setInterval(refreshKeys, 10 * 60 * 1000);

// Lazy client getters — always use latest key
const getGeminiClient = () => new GoogleGenerativeAI(_keys.gemini);
const getOpenAIClient = () => _keys.openai ? new OpenAI({ apiKey: _keys.openai }) : null;
const getDeepSeekClient = () => _keys.deepseek ? new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey: _keys.deepseek }) : null;
const getGeminiJsonModel = () => getGeminiClient().getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: { responseMimeType: 'application/json' },
});

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

// Whether this error means the provider is unusable — trigger fallback chain.
// Includes 401 (revoked/invalid key) so a dead key auto-falls to the next provider.
const isQuotaError = (err) => {
    const msg = (err?.message || '').toLowerCase();
    const status = err?.status || err?.statusCode || 0;
    return status === 429 || status === 402 || status === 401
        || msg.includes('429') || msg.includes('402') || msg.includes('401')
        || msg.includes('quota') || msg.includes('rate limit')
        || msg.includes('incorrect api key') || msg.includes('invalid api key')
        || msg.includes('insufficient balance') || msg.includes('insufficient_quota')
        || msg.includes('too many requests');
};

const fallbackToDeepSeekStream = async (prompt, res) => {
    res.write('\n\n*The finetuned model is warming up (cold start ~60s). Please try again in a moment.*');
};

// ── Call one provider for batch JSON (throws on error) ────────────────────────
const callProvider = async (provider, prompt) => {
    if (provider === 'openai') {
        if (!getOpenAIClient()) throw new Error('OpenAI API Key not configured');
        const c = await getOpenAIClient().chat.completions.create({
            messages: [
                { role: 'system', content: 'You are a helpful educational assistant. Output strictly valid JSON.' },
                { role: 'user',   content: prompt },
            ],
            model: OPENAI_MODEL,
            response_format: { type: 'json_object' },
        });
        return JSON.parse(cleanResponse(c.choices[0].message.content));

    } else if (provider === 'deepseek') {
        if (!getDeepSeekClient()) throw new Error('DeepSeek API Key not configured');
        const c = await getDeepSeekClient().chat.completions.create({
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
                throw new Error('Finetuned model is warming up (cold start ~60s). Please try again in a moment.');
            }
            throw err;
        }

    } else {
        // Gemini
        const result = await getGeminiJsonModel().generateContent(prompt);
        return JSON.parse(cleanResponse((await result.response).text()));
    }
};

// ── Universal batch generate — tries requested provider, auto-falls back on quota ──
const FALLBACK_CHAIN = ['openai', 'deepseek', 'gemini'];

const generateContent = async (provider, prompt) => {
    try {
        return await callProvider(provider, prompt);
    } catch (err) {
        if (!isQuotaError(err)) throw err;
        console.warn(`[AI] ${provider} quota hit — trying fallbacks`);
    }
    for (const fb of FALLBACK_CHAIN) {
        if (fb === provider) continue;
        try {
            const result = await callProvider(fb, prompt);
            console.log(`[AI] Fell back to ${fb} successfully`);
            return result;
        } catch (fbErr) {
            if (!isQuotaError(fbErr)) throw fbErr;
            console.warn(`[AI] ${fb} also quota-limited, continuing`);
        }
    }
    throw new Error('All AI providers are quota-limited. Please try again later.');
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

// ── GET /api/ai/refresh — force-fetches latest API keys from Modal config ─────
router.get('/refresh', asyncRoute(async (req, res) => {
    const before = { gemini: !!_keys.gemini, openai: !!_keys.openai };
    await refreshKeys();
    const after  = { gemini: !!_keys.gemini, openai: !!_keys.openai };
    res.json({ status: 'ok', before, after, config_url: FINETUNED_CONFIG_URL || 'not set' });
}));

// ── GET /api/ai/warmup — pre-warms the Modal finetuned container ──────────────
// Hit this ~90s before demo to eliminate cold-start wait for users.
router.get('/warmup', asyncRoute(async (req, res) => {
    if (!FINETUNED_HEALTH_URL) {
        return res.json({ modal_status: 'unknown', message: 'FINETUNED_HEALTH_URL not configured.' });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
        const resp = await fetch(FINETUNED_HEALTH_URL, { signal: controller.signal });
        clearTimeout(timer);
        const data = await resp.json().catch(() => ({}));
        return res.json({ modal_status: resp.ok ? 'warm' : 'cold', ...data });
    } catch (_) {
        clearTimeout(timer);
        return res.json({ modal_status: 'cold_starting', message: 'Container is starting. Try again in 60-90s.' });
    }
}));

// ── POST /api/ai/generate ──────────────────────────────────────────────────────
router.post('/generate', asyncRoute(async (req, res) => {
    const { provider, prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    // Finetuned models output free-text, not structured JSON.
    // Use openai as the first attempt; fallback chain (openai→deepseek→gemini)
    // handles dead keys automatically via isQuotaError.
    const effectiveProvider = isFinetuned(provider) ? 'openai' : (provider || 'openai');

    let lastError;
    for (let i = 0; i < 3; i++) {
        try {
            return res.json(await generateContent(effectiveProvider, prompt));
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

    // ask-rag returns JSON — finetuned models can't produce it, fall back to openai
    const effectiveProvider = isFinetuned(provider) ? 'openai' : (provider || 'openai');

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
            return res.json(await generateContent(effectiveProvider, prompt));
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

    const geminiStream = async () => {
        const m = getGeminiClient().getGenerativeModel({ model: 'gemini-2.0-flash' });
        const r = await m.generateContentStream(prompt);
        for await (const chunk of r.stream) res.write(chunk.text());
    };

    try {
        if (provider === 'openai') {
            try {
                if (!getOpenAIClient()) throw Object.assign(new Error('OpenAI not configured'), { status: 401 });
                const stream = await getOpenAIClient().chat.completions.create({
                    model: OPENAI_MODEL, messages: [{ role: 'user', content: prompt }], stream: true,
                });
                for await (const chunk of stream) res.write(chunk.choices[0]?.delta?.content || '');
            } catch (err) {
                if (isQuotaError(err)) { console.warn('[stream-generate] OpenAI dead, using Gemini'); await geminiStream(); }
                else throw err;
            }

        } else if (provider === 'deepseek') {
            try {
                if (!getDeepSeekClient()) throw Object.assign(new Error('DeepSeek not configured'), { status: 402 });
                const stream = await getDeepSeekClient().chat.completions.create({
                    model: DEEPSEEK_MODEL, messages: [{ role: 'user', content: prompt }], stream: true,
                });
                for await (const chunk of stream) res.write(chunk.choices[0]?.delta?.content || '');
            } catch (err) {
                if (isQuotaError(err)) { console.warn('[stream-generate] DeepSeek dead, using Gemini'); await geminiStream(); }
                else throw err;
            }

        } else if (isFinetuned(provider)) {
            try {
                await pipeFinetunedStream(ftModelName(provider), prompt, res);
            } catch (err) {
                if (isTimeoutOrDown(err)) await fallbackToDeepSeekStream(prompt, res);
                else throw err;
            }

        } else {
            await geminiStream();
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
    const { provider, question, milestoneContext } = req.body;
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

${milestoneContext ? `CURRENT LESSON CONTEXT (The student is currently looking at this):\n"""\n${milestoneContext}\n"""` : ''}

PAST KNOWLEDGE / DOCUMENT CONTEXT:
${context ? `"""\n${context}\n"""` : 'No specific context found. Rely on general AI knowledge.'}

INSTRUCTION: Answer accurately in markdown. Prioritize the PAST KNOWLEDGE context and the CURRENT LESSON CONTEXT where relevant.
DO NOT wrap in JSON or code fences.
`;

        const streamWithGeminiFallback = async (primaryFn) => {
            try {
                await primaryFn();
            } catch (err) {
                if (isQuotaError(err)) {
                    console.warn(`[stream-rag] ${provider} unavailable (${err.message?.slice(0,60)}), falling back to Gemini`);
                    const m = getGeminiClient().getGenerativeModel({ model: 'gemini-2.0-flash' });
                    const r = await m.generateContentStream(fullPrompt);
                    for await (const chunk of r.stream) res.write(chunk.text());
                } else {
                    throw err;
                }
            }
        };

        if (provider === 'openai') {
            await streamWithGeminiFallback(async () => {
                if (!getOpenAIClient()) throw Object.assign(new Error('OpenAI not configured'), { status: 401 });
                const stream = await getOpenAIClient().chat.completions.create({
                    model: OPENAI_MODEL, messages: [{ role: 'user', content: fullPrompt }], stream: true,
                });
                for await (const chunk of stream) res.write(chunk.choices[0]?.delta?.content || '');
            });

        } else if (provider === 'deepseek') {
            await streamWithGeminiFallback(async () => {
                if (!getDeepSeekClient()) throw Object.assign(new Error('DeepSeek not configured'), { status: 402 });
                const stream = await getDeepSeekClient().chat.completions.create({
                    model: DEEPSEEK_MODEL, messages: [{ role: 'user', content: fullPrompt }], stream: true,
                });
                for await (const chunk of stream) res.write(chunk.choices[0]?.delta?.content || '');
            });

        } else if (isFinetuned(provider)) {
            const ragQuestion = `
${milestoneContext ? `CURRENT LESSON CONTEXT:\n${milestoneContext}\n\n` : ''}
${context ? `Context from my notes:\n${context}\n\n` : ''}
Question: ${question}
`.trim();
            try {
                await pipeFinetunedStream(ftModelName(provider), ragQuestion, res);
            } catch (err) {
                if (isTimeoutOrDown(err)) await fallbackToDeepSeekStream(fullPrompt, res);
                else throw err;
            }

        } else {
            // gemini
            const m = getGeminiClient().getGenerativeModel({ model: 'gemini-2.0-flash' });
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
