let currentComplexity = 'low'; // Default fallback

export const cleanContent = (data) => {
    if (!data) return data;
    
    // If it's a string, try to see if it's actually a JSON object that should be a string
    if (typeof data === 'string' && data.trim().startsWith('{')) {
        try {
            const parsed = JSON.parse(data);
            // If the parsed object has a key that looks like it contains the content, extract it
            if (typeof parsed === 'object' && parsed !== null) {
                const keys = Object.keys(parsed);
                if (keys.length === 1) {
                    return cleanContent(parsed[keys[0]]);
                }
                // If it's a generic "text" or "content" key
                if (parsed.content) return cleanContent(parsed.content);
                if (parsed.text) return cleanContent(parsed.text);
                if (parsed.detailedContent) return cleanContent(parsed.detailedContent);
            }
        } catch (e) {
            // Not JSON or failed to parse, keep as string
        }
    }
    
    // Recursive cleaning for objects and arrays
    if (Array.isArray(data)) {
        return data.map(cleanContent);
    }
    
    if (typeof data === 'object' && data !== null) {
        const cleaned = {};
        for (const [key, value] of Object.entries(data)) {
            cleaned[key] = cleanContent(value);
        }
        return cleaned;
    }
    
    return data;
};

const generateFromBackend = async (prompt) => {
    const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ complexity: currentComplexity, prompt })
    });
    if (!response.ok) {
        try {
            const errJson = await response.json();
            throw new Error(errJson.details || errJson.error || "Failed to generate AI content");
        } catch (e) {
            if (e.message !== "Failed to fetch") {
                throw e;
            }
            let msg = await response.text();
            throw new Error(`Backend AI Error: ${msg}`);
        }
    }
    const data = await response.json();
    return cleanContent(data); 
};

export const llmService = {
    setProvider(provider) {
        currentComplexity = provider;
        console.log(`Switched to Local MLX Complexity: ${provider}`);
    },

    getCurrentProvider() {
        return currentComplexity;
    },

    async generateLearningPath(query) {
        const prompt = `
      You are an expert educational advisor. 
      Generate a structured learning path for a student wanting to learn: "${query}".
      
      Return the output as a JSON object with TWO keys: "milestones" and "graphData".
      
      1. "milestones": an array of objects representing the linear curriculum steps.
      Each milestone should have:
      - id: unique string or number
      - title: name of the milestone
      - topics: array of subtopics
      - progress: 0
      - hasFinetuning: boolean (true if it's a advanced or specific niche topic)
      - content: brief introductory text for this milestone
      Generate between 3 to 6 milestones.
      
      2. "graphData": A Directed Acyclic Graph (DAG) mapping the core concepts of this topic.
      It must contain "nodes" and "edges" properly formatted for React Flow.
      Nodes schema: [{ "id": "1", "type": "concept", "data": { "label": "Concept Name", "score": 0, "status": "active" }, "position": { "x": number, "y": number } }]
      Edges schema: [{ "id": "e1-2", "source": "1", "target": "2", "animated": true }]
      Make sure edges connect logically, and use coordinate logic to space nodes apart visually so they form a beautiful flowchart graph (e.g. cascading down or flowing left to right, spacing by at least 150-200px horizontally and 100px vertically). Use the exact string "concept" for the node type.
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
        const token = localStorage.getItem('auth_token');
        const response = await fetch('/api/ai/ask-rag', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ complexity: currentComplexity, question })
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
            body: JSON.stringify({ complexity: currentComplexity, question }) 
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
            body: JSON.stringify({ complexity: currentComplexity, prompt })
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

    async generateNextQuizQuestion(milestoneContext, type, pastHistory = [], userInstruction = "") {
        const { title, topics, content, graphData } = milestoneContext;
        
        let graphContext = '';
        if (graphData) {
            try {
                const parsed = typeof graphData === 'string' ? JSON.parse(graphData) : graphData;
                if (parsed && parsed.nodes) {
                    graphContext = `Available Concepts in Graph: ${JSON.stringify(parsed.nodes.map(n => ({id: n.id, label: n.data.label})))}`;
                }
            } catch(e) {}
        }
        
        const pastContext = pastHistory.map((q, i) => `Q${i+1}: ${q.text} (Student got it ${q.isCorrect ? 'right' : 'wrong'})`).join('\n');

        const prompt = `
      You are an expert tutor creating a dynamic quiz for the milestone titled: "${title}".
      Key topics: ${JSON.stringify(topics)}.
      Content context: "${content ? content.substring(0, 1500) : 'General knowledge on this topic'}".
      
      ${graphContext}
      IMPORTANT: If "Available Concepts in Graph" is provided, the question MUST strongly target one of the specific concepts from that list.
      
      Type of Quiz: ${type}.
      
      ${userInstruction ? `CRITICAL USER INSTRUCTION: "${userInstruction}"\nYou MUST adhere strictly to this instruction when formulating the question, tone, and options.` : ""}
      
      Past History of this session:
      ${pastHistory.length > 0 ? "The student has answered the following questions:\n" + pastContext + "\n\nCRITICAL: DO NOT repeat any of these questions. If the student got previous questions wrong, generate a question targeting the same concept but phrased differently to reinforce learning. If they got it right, move to a harder concept or a different topic from the milestone." : "This is the first question. Start with a foundational concept."}
      
      Generate exactly ONE multiple choice question.
      Return as JSON object with a key "question".
      Format: { "text": "Question text", "options": ["A", "B", "C", "D"], "correctAnswer": "exact string of correct option", "explanation": "Why it is correct", "targetConceptId": "the ID of the concept node this question tests (string) from the Available Concepts list if provided" }.
      CRITICAL: The ENTIRE output must be a SINGLE JSON object with the "question" key.
    `;
        const data = await generateFromBackend(prompt);
        // Robust detection: if data has 'options' and 'text' (or 'question' as a string), it's the raw question object.
        if (data && data.options && (data.text || typeof data.question === 'string')) {
            // If 'question' exists but is a string, it's the text. Move it to 'text' if needed.
            const rawQuestion = { ...data };
            if (typeof rawQuestion.question === 'string' && !rawQuestion.text) {
                rawQuestion.text = rawQuestion.question;
            }
            return { question: rawQuestion };
        }
        return data;
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

    async visualizeExplanation(explanation, instruction = "") {
        const instructionText = instruction ? `Student's specific instruction for the diagram: "${instruction}"` : "";
        const prompt = `
      Convert the following educational explanation into a comprehensive Mermaid.js diagram (e.g. flowchart TD, mindmap).
      Make sure to use strict valid Mermaid syntax.
      ${instructionText}
      
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
    },

    async generateRCA(graphData) {
        const prompt = `
      You are an expert educational advisor analyzing a student's Concept Gap Map.
      Here is the raw graph data showing concepts, their proficiency scores (0-100), and dependencies (edges):
      ${JSON.stringify(graphData)}
      
      Look for patterns where a student is struggling (low score, typically < 60) on an advanced concept, but the root cause is actually a prerequisite concept (a source node pointing to it) that also has a low score.
      If all scores are 0, just give a general encouraging starting advice suggesting where to begin.
      
      Return as a JSON object with two keys:
      - "insight": A 1-2 sentence HTML string describing the root cause pattern detected. Use <strong> tags to highlight concept names. Example: "You're struggling with <strong>Backpropagation</strong>, but the root cause is <strong>Chain Rule</strong>."
      - "recommendation": A 1-2 sentence HTML string with actionable advice based on the graph. Example: "Spend 10 minutes reviewing <strong>Chain Rule</strong> fundamentals first."
    `;
        return generateFromBackend(prompt); 
    }
};
