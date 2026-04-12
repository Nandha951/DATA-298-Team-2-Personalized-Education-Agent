let currentProvider = 'gemini';

const generateFromBackend = async (prompt) => {
    const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: currentProvider, prompt })
    });
    if (!response.ok) {
        let msg = await response.text();
        throw new Error(`Backend AI Error: ${msg}`);
    }
    return response.json(); // The backend cleans and parses the JSON for us!
};

export const llmService = {
    setProvider(provider) {
        currentProvider = provider;
        console.log(`Switched to LLM Provider: ${provider} (Backend Proxy)`);
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
        return generateFromBackend(prompt);
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
        return generateFromBackend(prompt);
    },

    async getDoubtAnswer(question) {
        // Fallback for non-streaming components
        const token = localStorage.getItem('auth_token');
        const response = await fetch('/api/ai/ask-rag', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ provider: currentProvider, question })
        });
        
        if (!response.ok) {
            let msg = await response.text();
            throw new Error(`RAG Query Error: ${msg}`);
        }
        return response.json(); 
    },

    async *streamDoubtAnswer(question) {
        const token = localStorage.getItem('auth_token');
        const response = await fetch('/api/ai/stream-rag', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ question }) // Stream endpoint expects raw Text
        });
        
        if (!response.ok) {
            throw new Error('Stream request failed');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            yield decoder.decode(value, { stream: true });
        }
    },

    async *streamGenericContent(prompt) {
        const response = await fetch('/api/ai/stream-generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });
        if (!response.ok) throw new Error('Stream request failed');

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            yield decoder.decode(value, { stream: true });
        }
    },

    async generateNextQuizQuestion(milestoneContext, type, pastHistory = []) {
        const { title, topics, content } = milestoneContext;
        
        const pastContext = pastHistory.map((q, i) => `Q${i+1}: ${q.text} (Student got it ${q.isCorrect ? 'right' : 'wrong'})`).join('\n');

        const prompt = `
      You are an expert tutor creating a dynamic quiz for the milestone titled: "${title}".
      Key topics: ${JSON.stringify(topics)}.
      Content context: "${content ? content.substring(0, 1500) : 'General knowledge on this topic'}".
      
      Type of Quiz: ${type}.
      
      Past History of this session:
      ${pastHistory.length > 0 ? "The student has answered the following questions:\n" + pastContext + "\n\nCRITICAL: DO NOT repeat any of these questions. If the student got previous questions wrong, generate a question targeting the same concept but phrased differently to reinforce learning. If they got it right, move to a harder concept or a different topic from the milestone." : "This is the first question. Start with a foundational concept."}
      
      Generate exactly ONE multiple choice question.
      Return as JSON object with a key "question".
      Format: { text: "Question text", options: ["A", "B", "C", "D"], correctAnswer: "exact string of correct option", explanation: "Why it is correct" }.
    `;
        return generateFromBackend(prompt);
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
        return generateFromBackend(prompt);
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
        return generateFromBackend(prompt);
    },

    async visualizeExplanation(explanation) {
        const prompt = `
      Convert the following educational explanation into a comprehensive Mermaid.js diagram (e.g. flowchart TD, mindmap).
      Make sure to use strict valid Mermaid syntax.
      
      CRITICAL MERMAID SYNTAX RULES:
      1. Node IDs MUST be simple alphanumeric without special characters (e.g., A, B, C).
      2. If node labels contain spaces, brackets, or special characters, you MUST wrap the label in double quotes (e.g., A["Focuses on The Big Picture"]).
      3. DO NOT put unescaped double quotes inside of string labels. Use single quotes instead if quoting is necessary inside the label (e.g., A["Focuses on 'The Big Picture'"]).
      4. DO NOT use characters like -, +, or parenthesis inside node IDs, only in the quoted labels.
      5. Output ONLY the raw Mermaid code block.
      
      Explanation text:
      "${explanation}"
      
      Return as a JSON object with a key "mermaidCode" containing the raw mermaid code string.
    `;
        return generateFromBackend(prompt);
    }
};
