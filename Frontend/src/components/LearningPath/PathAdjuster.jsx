import { useState } from 'react';
import { useLearningPath } from '../../context/LearningPathContext';
import { llmService } from '../../services/llmService';

function PathAdjuster() {
    const { milestones, setMilestones } = useLearningPath();
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleAdjust = async (e) => {
        e.preventDefault();
        if (!input.trim()) return;

        setLoading(true);
        setError(null);

        try {
            const data = await llmService.adjustLearningPath(milestones, input);
            if (data && data.milestones) {
                setMilestones(data.milestones);
                setInput('');
            }
        } catch (err) {
            console.error(err);
            setError(err.message || "Failed to adjust learning path. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    if (!milestones || milestones.length === 0) return null;

    return (
        <div className="path-adjuster" style={{ margin: '20px 0', padding: '15px', background: '#e3f2fd', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 10px 0' }}>Adjust Your Learning Path</h3>
            <p style={{ margin: '0 0 10px 0', fontSize: '0.9rem' }}>Want to change direction? Tell me what you'd like to focus on or skip.</p>
            <form onSubmit={handleAdjust} style={{ display: 'flex', gap: '10px' }}>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="e.g., Skip the basics and focus on practical examples"
                    disabled={loading}
                    style={{ flex: 1, padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
                />
                <button type="submit" disabled={!input || loading} style={{ whiteSpace: 'nowrap' }}>
                    {loading ? 'Adjusting...' : 'Update Path'}
                </button>
            </form>
            {error && <div className="error-message" style={{ marginTop: '10px', color: '#d32f2f' }}>{error}</div>}
        </div>
    );
}

export default PathAdjuster;
