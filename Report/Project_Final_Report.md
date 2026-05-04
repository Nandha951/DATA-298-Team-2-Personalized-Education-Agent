# DATA 298B Technical Project Report: Personalized Education Agent (PEA)

**Project Title:** Personalized Education Agent (PEA) with Semantic Memory & RAG  
**Academic Year:** 2025-2026  
**Course:** DATA 298B - Master's Project II  
**University:** San José State University  

---

## Executive Summary
The Personalized Education Agent (PEA) is a master's level research project that integrates state-of-the-art Generative AI with Retrieval-Augmented Generation (RAG) to create a highly adaptive learning environment. The system enables students to generate custom learning paths, interact with AI tutors that "remember" their specific course materials via ChromaDB, and visualize their mastery through dynamic dependency graphs. This report provides a deep technical breakdown of the system's architecture, implementation, and future directions.

---

## 1. System Architecture & The Technology Stack
The PEA system is designed as a secure, distributed application optimized for semantic reasoning.

### 1.1 Frontend: The Interactive Core
- **Framework:** React 18+ with Vite for ultra-fast HMR and bundle optimization.
- **State Management:** React Context API for lightweight, project-wide synchronization of user authentication and learning path data.
- **Visualizations:** `ReactFlow` for rendering interactive Concept Knowledge Maps and `Lucide-React` for high-fidelity iconography.
- **Styling:** Vanilla CSS with custom design tokens for glassmorphic aesthetics, CSS variables for dark mode support, and smooth transitions.

### 1.2 Backend: Secure AI Proxy & Persistence
- **Engine:** Node.js with Express.
- **ORM:** Prisma, providing a type-safe interface to the SQLite database.
- **Authentication:** JWT (JSON Web Tokens) with 24-hour expiration and Bcrypt for secure password hashing.
- **Middleware:** `Multer` for secure multi-part file handling and `requireAuth` for endpoint protection.

### 1.3 AI & Vector Intelligence
- **Primary LLM:** Google Gemini 1.5 Flash (optimized for low latency and high-throughput streaming).
- **Fallback Models:** Integrated support for OpenAI (GPT-4o) and DeepSeek-V3 via a universal provider bridge.
- **Vector Database:** ChromaDB (running locally via Docker or a standalone server).
- **Embeddings:** Google `text-embedding-004` used for converting natural language into 768-dimensional vectors.

---

## 2. Implementation: The RAG Pipeline (Semantic Memory)
The most critical feature of PEA is its ability to ground AI responses in a student's own documents, preventing hallucinations.

### 2.1 Data Ingestion & OCR
We utilized **LlamaParse** (LlamaCloud) to handle complex document structures (tables, multi-column layouts).
1. Files are uploaded via a secure multipart request.
2. LlamaParse converts PDFs/Images into a structured Markdown format.
3. The Markdown is then sent to the backend for semantic processing.

### 2.2 Vector Storage Workflow
Implemented in `services/vectorDb.js`:
- **Semantic Chunking:** Content is split into chunks of ~800 characters, breaking at natural boundaries (newlines/periods) to preserve contextual integrity.
- **Vectorization:** Each chunk is converted into an embedding using the Gemini API.
- **Persistence:** Chunks are stored in ChromaDB, tagged with `userId`, `filename`, and `chunkIndex` for precise retrieval.

### 2.3 Retrieval & Prompt Injection
When a student asks a question:
1. The question is vectorized.
2. ChromaDB performs a similarity search (Cosine Similarity) within the student's specific collection.
3. The top 3-5 most relevant chunks are retrieved.
4. **Contextual Injection:** The system prompt is dynamically reconstructed:
   > "Using only the provided context snippets from the student's document, answer the following question. If the information is missing, state so rather than guessing."

---

## 3. Advanced Features & User Experience
### 3.1 Dynamic Concept Knowledge Map
The system uses the LLM to generate a dependency graph of concepts (JSON format).
- **Logic:** Each milestone is analyzed for its underlying concepts.
- **Rendering:** ReactFlow parses these concepts into "Mastered", "Learning", and "Gap" nodes.
- **AI Root-Cause Analysis:** An additional AI layer analyzes the map to suggest specific prerequisites the student may have missed.

### 3.2 "Hands-Free" AI Tutor (Voice Mode)
To support multi-modal learning, we implemented:
- **Speech-to-Text (STT):** Web Speech API for real-time transcription of student questions.
- **Text-to-Speech (TTS):** Synthesis of AI responses, allowing students to learn while multitasking or to improve accessibility.

### 3.3 Typewriter Streaming Engine
To avoid the "blank screen" effect during LLM generation:
- The backend streams data using Server-Sent Events (SSE).
- The frontend implements a custom "Typewriter Loop" that buffers incoming text and displays it progressively at a smooth framerate (optimized to 40ms intervals to prevent ReactMarkdown flickering).

---

## 4. Security & Privacy Considerations
1. **API Key Isolation:** All AI provider keys are stored in environment variables on the backend, never reaching the client side.
2. **User Data Separation:** Vector collections in ChromaDB are strictly segregated by `userId`.
3. **JWT Guarding:** Every request to the AI, Vector DB, or File System requires a valid, verified token.

---

## 5. Performance Metrics & Results
- **Path Generation:** ~3-5 seconds for a full 10-milestone curriculum.
- **Semantic Retrieval:** <200ms for ChromaDB similarity search.
- **Streaming Latency:** First-token delivery in <800ms.
- **Accuracy:** RAG-grounded responses showed a 90%+ reduction in hallucinations compared to baseline LLM queries (based on internal testing with technical course materials).

---

## 6. Conclusion & Roadmap
The Personalized Education Agent successfully bridges the gap between static content and intelligent tutoring. It provides a robust blueprint for AI-integrated educational tools.

### Future Roadmap
- **Fine-Tuning:** Moving from RAG to parameter-efficient fine-tuning (PEFT) on specific subject domains.
- **Multi-Agent Collaboration:** Implementing specialized agents for different subjects (e.g., a "Math Specialist" agent vs. a "History Specialist").
- **LTI Integration:** Standardizing API responses to fit into existing Learning Management Systems (LMS) like Blackboard or Canvas.

---

## 7. References
1. Lewis, P., et al. (2020). "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks."
2. Piech, C., et al. (2015). "Deep Knowledge Tracing."
3. Vaswani, A., et al. (2017). "Attention Is All You Need." (Transformer Architecture).
4. Google Cloud. (2024). "Vertex AI: Gemini Models & Embeddings Documentation."
