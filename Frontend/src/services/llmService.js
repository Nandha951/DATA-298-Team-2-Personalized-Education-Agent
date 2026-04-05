import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const DEEPSEEK_API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY;

// --- Helper Functions ---
const cleanResponse = (text) => {
    // Remove markdown code blocks if present (```json ... ```)
    return text.replace(/```json/g, "").replace(/```/g, "").trim();
};

const withRetry = async (fn, retries = 3, delay = 2000) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            const isTransient = error.message?.includes("503") || error.message?.includes("500") || error.message?.includes("high demand") || error.status === 429;
            if (isTransient && i < retries - 1) {
                console.warn(`LLM Service: Temporary error. Retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw error;
        }
    }
};

// --- Provider Clients ---

// 1. Gemini
const geminiClient = new GoogleGenerativeAI(GEMINI_API_KEY);
const geminiModel = geminiClient.getGenerativeModel({
    model: "gemini-flash-latest",
    generationConfig: { responseMimeType: "application/json" },
});

// 2. OpenAI
const openaiClient = OPENAI_API_KEY ? new OpenAI({
    apiKey: OPENAI_API_KEY,
    dangerouslyAllowBrowser: true // Frontend-only demo requirement
}) : null;

// 3. Deepseek (OpenAI Compatible)
const deepseekClient = DEEPSEEK_API_KEY ? new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: DEEPSEEK_API_KEY,
    dangerouslyAllowBrowser: true
}) : null;


// --- Strategies ---
const OPENAI_MODEL = import.meta.env.VITE_OPENAI_MODEL || "gpt-5-nano";
const DEEPSEEK_MODEL = import.meta.env.VITE_DEEPSEEK_MODEL || "deepseek-chat";

// --- Strategies ---
const strategies = {
    gemini: {
        generate: async (prompt) => {
            const result = await geminiModel.generateContent(prompt);
            const response = await result.response;
            let text = response.text();
            return JSON.parse(cleanResponse(text));
        }
    },
    openai: {
        generate: async (prompt) => {
            if (!openaiClient) throw new Error("OpenAI API Key not configured in .env");
            const completion = await openaiClient.chat.completions.create({
                messages: [
                    { role: "system", content: "You are a helpful educational assistant. Output strictly valid JSON." },
                    { role: "user", content: prompt }
                ],
                model: OPENAI_MODEL,
                response_format: { type: "json_object" },
            });
            return JSON.parse(cleanResponse(completion.choices[0].message.content));
        }
    },
    deepseek: {
        generate: async (prompt) => {
            if (!deepseekClient) throw new Error("Deepseek API Key not configured in .env");
            const completion = await deepseekClient.chat.completions.create({
                messages: [
                    { role: "system", content: "You are a helpful educational assistant. Output strictly valid JSON." },
                    { role: "user", content: prompt }
                ],
                model: DEEPSEEK_MODEL,
                response_format: { type: "json_object" },
            });
            return JSON.parse(cleanResponse(completion.choices[0].message.content));
        }
    }
};

let currentProvider = 'gemini';

export const llmService = {
    setProvider(provider) {
        if (!strategies[provider]) {
            console.warn(`Provider ${provider} not supported. Fallback to gemini.`);
            currentProvider = 'gemini';
            return;
        }
        currentProvider = provider;
        console.log(`Switched to LLM Provider: ${provider}`);
    },

    getCurrentProvider() {
        return currentProvider;
    },

    async generateLearningPath(query) {
        const prompt = `
      You are an expert educational advisor. 
      Generate a structured learning path for a student wanting to learn: "${query}".
      
      Return the output as a JSON object with a key "milestones".
      Each milestone should have:
      - id: unique string or number
      - title: name of the milestone
      - topics: array of subtopics
      - progress: 0
      - hasFinetuning: boolean (true if it's a advanced or specific niche topic)
      - content: brief introductory text for this milestone
      
      Generate between 3 to 6 milestones.
    `;
        return withRetry(() => strategies[currentProvider].generate(prompt));
    },

    async generateMilestoneContent(milestone) {
        const prompt = `
      You are an expert tutor creating detailed educational content for a specific milestone.
      
      Milestone Title: "${milestone.title}"
      Topics to cover: ${JSON.stringify(milestone.topics)}
      
      Generate a comprehensive, explanatory tutorial for this milestone.
      This content should be educational and explain the concepts clearly. It should be suitable for a student to learn from directly.
      
      Return as a JSON object with a key "detailedContent".
      The value should be a string (markdown format is allowed).
    `;
        return withRetry(() => strategies[currentProvider].generate(prompt));
    },

    async getDoubtAnswer(question, context) {
        const prompt = `
      Student Question: "${question}"
      Context: ${context}
      
      Answer the question concisely and helpfully as an AI tutor.
      Return as a JSON object with a key "answer".
    `;
        return withRetry(() => strategies[currentProvider].generate(prompt));
    },

    async getQuiz(milestoneContext, type) {
        const { title, topics, content } = milestoneContext;
        const prompt = `
      Generate 3 multiple choice questions for a quiz on the milestone titled: "${title}".
      Key topics: ${JSON.stringify(topics)}.
      Content context: "${content ? content.substring(0, 1000) : 'General knowledge on this topic'}".
      
      Type: ${type} (initial assessment or follow-up).
      
      The questions must be specific to the content provided above. Avoid generic questions.
      
      Return as JSON object with a key "questions".
      Each question: { id, text, options: [], correctAnswer, explanation }.
    `;
        return withRetry(() => strategies[currentProvider].generate(prompt));
    },

    async adjustLearningPath(currentMilestones, adjustmentInstruction) {
        const prompt = `
      You are an expert educational advisor.
      The student is currently following this learning path with these milestones:
      ${JSON.stringify(currentMilestones, null, 2)}
      
      The student has requested to change their learning direction: "${adjustmentInstruction}".
      
      IMPORTANT RULE: You MUST keep ALL existing milestones (including incomplete ones) and append or insert the new content based on the adjustment instruction, UNLESS the user explicitly mentions removing, replacing, or skipping existing ones.
      
      Return the output as a JSON object with a key "milestones".
      Each milestone should adhere to the same schema:
      - id: unique string or number (preserve existing ids if keeping a milestone)
      - title: name of the milestone
      - topics: array of subtopics
      - progress: 0 (or 100 if preserving a previously completed milestone)
      - completed: boolean (true if preserving a previously completed milestone)
      - hasFinetuning: boolean
      - content: brief introductory text
    `;
        return withRetry(() => strategies[currentProvider].generate(prompt));
    },

    async personalizeContent(selectedText, instruction, fullContext) {
        const prompt = `
      You are an expert tutor. The student selected this text from their lesson:
      "${selectedText}"
      
      Here is the full lesson context:
      "${fullContext}"
      
      Student's instruction to change the text:
      "${instruction}"
      
      Please rewrite the selected text according to the student's instruction.
      To ensure we replace the correct formatting, please extract the EXACT substring from the "full lesson context" that corresponds to the selected text, including any markdown formatting like ** or ## or newlines.
      
      Return as a JSON object with two keys:
      - "originalTextToReplace": The exact literal string from the context to be replaced.
      - "replacementText": The new rewritten text.
    `;
        return withRetry(() => strategies[currentProvider].generate(prompt));
    }
};
