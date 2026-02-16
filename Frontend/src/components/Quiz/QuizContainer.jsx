import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { useLearningPath } from '../../context/LearningPathContext';
import { llmService } from '../../services/llmService';
import Question from './Question';

function QuizContainer({ milestoneContext, type }) {
    const navigate = useNavigate();
    const { completeMilestone, milestones } = useLearningPath();
    const [questions, setQuestions] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [score, setScore] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [quizCompleted, setQuizCompleted] = useState(false);

    useEffect(() => {
        if (milestoneContext) {
            fetchQuestions();
        }
    }, [milestoneContext, type]);

    const fetchQuestions = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await llmService.getQuiz(milestoneContext, type);
            setQuestions(data.questions || []);
        } catch (err) {
            console.error('Error fetching questions:', err);
            setError(err.message || 'Failed to generate questions. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitAnswer = async (answer) => {
        try {
            const currentQuestion = questions[currentIndex];
            const isCorrect = answer === currentQuestion.correctAnswer;

            if (isCorrect) {
                setScore(prev => prev + 1);
            }

            return {
                correct: isCorrect,
                explanation: currentQuestion.explanation
            };
        } catch (err) {
            console.error('Error scoring answer:', err);
            return { explanation: "Error checking answer." };
        }
    };

    const handleNext = () => {
        if (currentIndex < questions.length - 1) {
            setCurrentIndex(currentIndex + 1);
        } else {
            setQuizCompleted(true);
            completeMilestone(milestoneContext.id);
        }
    };

    if (loading) return <div>Generating personalized quiz questions based on the lesson content...</div>;
    if (error) return <div className="error">{error}</div>;
    if (questions.length === 0) {
        return <div>No questions available for this module.</div>;
    }

    if (quizCompleted) {
        const currentMilestoneIndex = milestones.findIndex(m => String(m.id) === String(milestoneContext.id));
        const nextMilestone = milestones[currentMilestoneIndex + 1];

        return (
            <div className="quiz-summary">
                <h2>Quiz Completed!</h2>
                <p>Your Score: {score} / {questions.length}</p>
                <div className="summary-actions" style={{ marginTop: '20px', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                    <button onClick={() => navigate(`/milestone/${milestoneContext.id}`)}>
                        Review Milestone
                    </button>

                    {nextMilestone && (
                        <button
                            onClick={() => navigate(`/milestone/${nextMilestone.id}`)}
                            style={{ backgroundColor: '#4CAF50' }}
                        >
                            Next: {nextMilestone.title}
                        </button>
                    )}

                    <button onClick={() => navigate('/dashboard')}>
                        Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="quiz-container">
            <div className="quiz-header">
                <span>Question {currentIndex + 1} of {questions.length}</span>
                <span>Score: {Math.max(0, score)}/{questions.length}</span>
            </div>

            <Question
                key={currentIndex}
                question={questions[currentIndex]}
                onSubmit={handleSubmitAnswer}
            />

            <button onClick={handleNext} className="next-button" style={{ marginTop: '20px' }}>
                {currentIndex < questions.length - 1 ? 'Next Question' : 'Finish Quiz'}
            </button>
        </div>
    );
}

QuizContainer.propTypes = {
    milestoneContext: PropTypes.shape({
        id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        title: PropTypes.string,
        topics: PropTypes.arrayOf(PropTypes.string),
        content: PropTypes.string,
    }).isRequired,
    type: PropTypes.string.isRequired,
};

export default QuizContainer;
