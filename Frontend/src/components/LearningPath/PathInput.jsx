import { useState } from 'react';
import { llmService } from '../../services/llmService';
import { llamaParseService } from '../../services/llamaParseService';


function PathInput({ onPathGenerated }) {
    const [input, setInput] = useState('');
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!input.trim() && !file) return;

        setLoading(true);
        setError(null);

        let finalQuery = input;

        try {
            if (file) {
                // If there's an attachment, parse it with LlamaParse first
                const parsedMarkdown = await llamaParseService.parseFile(file);
                finalQuery = `User's Goal: ${input}\n\nAttached Context Document:\n${parsedMarkdown}`;
            }

            const data = await llmService.generateLearningPath(finalQuery);
            if (data && data.milestones) {
                onPathGenerated(data.milestones, input || "Path from Document");
            }
        } catch (err) {
            console.error(err);
            setError(err.message || "Failed to generate learning path. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="path-input-container">
            <h1>What would you like to learn?</h1>
            <form onSubmit={handleSubmit}>
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="e.g., I want to learn about fine-tuning LLMs"
                    rows="4"
                    disabled={loading}
                />
                
                <div style={{ marginTop: '10px', marginBottom: '10px' }}>
                    <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px', fontWeight: 'bold' }}>
                        Attach Context Document (Optional, LlamaParse):
                    </label>
                    <input 
                        type="file" 
                        accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.csv,.html,.epub"
                        onChange={handleFileChange}
                        disabled={loading}
                    />
                </div>

                {error && <div className="error-message">{error}</div>}
                <button type="submit" disabled={(!input && !file) || loading}>
                    {loading ? (file ? 'Parsing file & Generating...' : 'Generating...') : 'Create Learning Path'}
                </button>
            </form>
        </div>
    );
}

export default PathInput;
