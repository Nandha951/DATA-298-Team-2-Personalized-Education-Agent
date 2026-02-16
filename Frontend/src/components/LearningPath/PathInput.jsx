import { useState } from 'react';
import { llmService } from '../../services/llmService';


function PathInput({ onPathGenerated }) {
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!input.trim()) return;

        setLoading(true);
        setError(null);

        try {
            const data = await llmService.generateLearningPath(input);
            if (data && data.milestones) {
                onPathGenerated(data.milestones, input);
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
                {error && <div className="error-message">{error}</div>}
                <button type="submit" disabled={!input || loading}>
                    {loading ? 'Generating...' : 'Create Learning Path'}
                </button>
            </form>
        </div>
    );
}

export default PathInput;
