import { useState } from 'react';
import { useLearningPath } from '../../context/LearningPathContext';
import { llmService } from '../../services/llmService';
import { llamaParseService } from '../../services/llamaParseService';

function PathAdjuster() {
    const { milestones, setMilestones } = useLearningPath();
    const [input, setInput] = useState('');
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleAdjust = async (e) => {
        e.preventDefault();
        if (!input.trim() && !file) return;

        setLoading(true);
        setError(null);

        let finalQuery = input;

        try {
            if (file) {
                const parsedMarkdown = await llamaParseService.parseFile(file);
                finalQuery += `\n\n[Attached Context Document]\n${parsedMarkdown}`;
            }

            const data = await llmService.adjustLearningPath(milestones, finalQuery);
            if (data && data.milestones) {
                setMilestones(data.milestones);
                setInput('');
                setFile(null);
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
            <form onSubmit={handleAdjust} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="e.g., Skip the basics and focus on practical examples"
                        disabled={loading}
                        style={{ flex: 1, padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
                    />
                    <button type="submit" disabled={(!input && !file) || loading} style={{ whiteSpace: 'nowrap' }}>
                        {loading ? (file ? 'Parsing & Adjusting...' : 'Adjusting...') : 'Update Path'}
                    </button>
                </div>
                
                <div style={{ fontSize: '12px', color: '#555' }}>
                    <label style={{ marginRight: '8px', fontWeight: 'bold' }}>Attach File (Optional, LlamaParse):</label>
                    <input 
                        type="file" 
                        accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.csv,.html,.epub"
                        onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                                setFile(e.target.files[0]);
                            }
                        }}
                        disabled={loading}
                    />
                </div>
            </form>
            {error && <div className="error-message" style={{ marginTop: '10px', color: '#d32f2f' }}>{error}</div>}
        </div>
    );
}

export default PathAdjuster;
