import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/Shared/Navbar';
import QuizContainer from '../components/Quiz/QuizContainer';
import { useLearningPath } from '../context/LearningPathContext';

function QuizPage() {
    const { milestoneId, type } = useParams();
    const { getMilestoneById, learningPaths, currentPathId } = useLearningPath();
    const [milestone, setMilestone] = useState(null);
    const currentPath = learningPaths.find(p => String(p.id) === String(currentPathId));

    useEffect(() => {
        // Fetch the milestone details to pass as context
        const found = getMilestoneById(milestoneId);
        setMilestone(found);
    }, [milestoneId, getMilestoneById]);

    if (!milestone) return <div>Loading...</div>;

    // Prepare context object with defaults if specific fields are missing
    const milestoneContext = {
        id: milestone.id,
        title: milestone.title,
        topics: milestone.topics || [],
        content: milestone.detailedContent || milestone.content || "General knowledge",
        graphData: currentPath?.graphData,
    };

    return (
        <div className="quiz-page">
            <Navbar />
            <div className="quiz-content-wrapper">
                <div className="quiz-header-section">
                    <h1>{type === 'initial' ? 'Initial Assessment' : 'Follow-up Quiz'}</h1>
                    <h3 className="subtitle">Topic: {milestone.title}</h3>
                    <Link to={`/milestone/${milestoneId}`} className="back-link">Return to Milestone</Link>
                </div>

                <QuizContainer milestoneContext={milestoneContext} type={type} />
            </div>
        </div>
    );
}

export default QuizPage;
