const { ChromaClient } = require('chromadb');
const { v4: uuidv4 } = require('uuid');

// Xenova transformers for local embeddings
let pipeline = null;

async function getEmbeddingPipeline() {
    if (!pipeline) {
        // Dynamically import since it's an ESM package or we use require
        console.log("[VectorDB] Loading local embedding model (Xenova/all-MiniLM-L6-v2)...");
        const transformers = await import('@xenova/transformers');
        // By default, it downloads the model from huggingface and caches it in the file system
        pipeline = await transformers.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        console.log("[VectorDB] Local embedding model loaded successfully.");
    }
    return pipeline;
}

// Generate embedding for a single text
async function generateEmbedding(text) {
    const pipe = await getEmbeddingPipeline();
    // pooling: 'mean' and normalize: true is best practice for semantic search
    const output = await pipe(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
}

// Default endpoint for Chroma backend is http://localhost:8000
const client = new ChromaClient({ path: process.env.CHROMA_URL || "http://localhost:8000" });

// Simple chunking algorithm
function chunkText(text, maxChars = 1000) {
    const chunks = [];
    let i = 0;
    while (i < text.length) {
        let end = i + maxChars;
        // Try to break at a newline or period if possible
        if (end < text.length) {
            let nextNewLine = text.lastIndexOf('\n', end);
            let nextPeriod = text.lastIndexOf('. ', end);
            if (nextNewLine > i) end = nextNewLine + 1;
            else if (nextPeriod > i) end = nextPeriod + 2;
        }
        chunks.push(text.substring(i, end).trim());
        i = end;
    }
    return chunks;
}

const vectorDb = {
    async initialize() {
        try {
            await client.heartbeat();
            console.log("Vector DB connected successfully!");
            // Pre-load the model asynchronously so it's ready for the first request
            getEmbeddingPipeline().catch(e => console.error("[VectorDB] Failed to pre-load embedding model:", e));
        } catch (e) {
            console.warn("ChromaDB Server is not running on port 8000. Vector functionalities will be skipped until it is started.");
        }
    },

    // Save uploaded file content into semantic memory
    async saveDocument(userId, filename, markdownContent) {
        try {
            console.log(`[VectorDB] Initiating storage for file: ${filename} (User: ${userId})`);
            const collection = await client.getOrCreateCollection({ name: `user_${userId}_documents` });
            
            const chunks = chunkText(markdownContent, 800); 
            console.log(`[VectorDB] Document chunked into ${chunks.length} sections. Generating embeddings...`);
            
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                if (!chunk) continue;

                // Generate real local embedding
                const vector = await generateEmbedding(chunk);

                await collection.add({
                    ids: [uuidv4()],
                    embeddings: [vector],
                    metadatas: [{ source: filename, chunkIndex: i }],
                    documents: [chunk]
                });
            }
            console.log(`[VectorDB] SUCCESS: Successfully saved ${chunks.length} vectorized chunks to ChromaDB.`);
        } catch (e) {
            console.error("[VectorDB] ERROR: Failed to save to Vector DB:", e.message);
        }
    },

    // Query Semantic Memory
    async queryMemory(userId, question, topK = 3) {
        try {
            console.log(`[VectorDB] Searching memory for: "${question}" (User: ${userId})`);
            const collection = await client.getCollection({ name: `user_${userId}_documents` });
            
            console.log(`[VectorDB] Generating embedding for query...`);
            const searchVector = await generateEmbedding(question);

            console.log(`[VectorDB] Querying collection with retrieved vector...`);
            const results = await collection.query({
                queryEmbeddings: [searchVector],
                nResults: topK
            });

            // Flatten results
            if (results.documents && results.documents[0] && results.documents[0].length > 0) {
                const docCount = results.documents[0].length;
                console.log(`[VectorDB] SUCCESS: Found ${docCount} highly relevant context chunks!`);
                return results.documents[0].join("\n\n---\n\n");
            }
            console.log(`[VectorDB] DEBUG: No relevant memory matches found.`);
            return "";

        } catch (e) {
            console.warn(`[VectorDB] WARNING: No collection found for User: ${userId}. Returning empty context.`);
            return "";
        }
    }
};

module.exports = vectorDb;
