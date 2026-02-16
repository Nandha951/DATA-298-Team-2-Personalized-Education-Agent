import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/Shared/Navbar';
import DoubtChat from '../components/AI/DoubtChat';
import { useLearningPath } from '../context/LearningPathContext';
import { llmService } from '../services/llmService';
import ReactMarkdown from 'react-markdown';

function MilestoneDetail() {
    const { id } = useParams();
    const { getMilestoneById, updateMilestone } = useLearningPath();
    const [milestone, setMilestone] = useState(null);
    const [loading, setLoading] = useState(true);
    const [generatingContent, setGeneratingContent] = useState(false);

    useEffect(() => {
        const found = getMilestoneById(id);
        setMilestone(found);
        setLoading(false);

        if (found && !found.detailedContent && !generatingContent) {
            generateContent(found);
        }
    }, [id, getMilestoneById, generatingContent]);

    const generateContent = async (m) => {
        setGeneratingContent(true);
        try {
            const result = await llmService.generateMilestoneContent(m);
            if (result && result.detailedContent) {
                // Save to context so we don't regenerate
                updateMilestone(m.id, { detailedContent: result.detailedContent });
                // Update local state to reflect immediately
                setMilestone(prev => ({ ...prev, detailedContent: result.detailedContent }));
            }
        } catch (err) {
            console.error("Failed to generate detailed content", err);
        } finally {
            setGeneratingContent(false);
        }
    };

    if (loading) return <div>Loading milestone...</div>;
    if (!milestone) return (
        <div className="error-page">
            <Navbar />
            <div className="content">
                <p>Milestone not found. Please return to the dashboard.</p>
                <Link to="/dashboard">Back to Dashboard</Link>
            </div>
        </div>
    );

    return (
        <div className="milestone-detail-page">
            <Navbar />
            <div className="content-container">
                <Link to="/dashboard" className="back-link">← Back to Dashboard</Link>
                <h1>{milestone.title}</h1>

                <div className="milestone-content">
                    <div className="topics-section">
                        <h2>Topics Covered</h2>
                        <ul>
                            {milestone.topics && milestone.topics.map((topic, i) => (
                                <li key={i}>{topic}</li>
                            ))}
                        </ul>

                        {generatingContent && !milestone.detailedContent && (
                            <div className="loading-content">
                                Generating detailed lesson... This may take a few seconds.
                            </div>
                        )}

                        <div className="content-text" style={{ margin: '1rem 0', lineHeight: '1.8' }}>
                            {milestone.detailedContent ? (
                                <ReactMarkdown>{milestone.detailedContent}</ReactMarkdown>
                            ) : (
                                <p>{milestone.content || "Content is being prepared..."}</p>
                            )}
                        </div>
                    </div>

                    <div className="actions-section" style={{ margin: '2rem 0' }}>
                        {milestone.detailedContent && (
                            <Link to={`/quiz/${id}/initial`}>
                                <button className="quiz-btn">Take Initial Quiz</button>
                            </Link>
                        )}
                    </div>

                    <div className="doubt-section">
                        <h2>Need Help?</h2>
                        <DoubtChat milestoneContext={milestone.title + ": " + (milestone.detailedContent || milestone.content || "")} />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default MilestoneDetail;
