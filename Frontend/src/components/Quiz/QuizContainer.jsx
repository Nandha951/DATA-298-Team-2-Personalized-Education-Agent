import React, { useState, useEffect, useRef } from 'react';
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

    const fetchNextQuestion = async (history) => {
        setLoading(true);
        setError(null);
        try {
            const data = await llmService.generateNextQuizQuestion(milestoneContext, type, history);
            if (data && data.question) {
                setQuestions(prev => [...prev, data.question]);
                setCurrentIndex(history.length);
            }
        } catch (err) {
            console.error('Error fetching question:', err);
            setError(err.message || 'Failed to generate question. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const [pastHistory, setPastHistory] = useState([]);
    const [isAnswered, setIsAnswered] = useState(false);
    const hasFetchedInitial = React.useRef(false);

    useEffect(() => {
        if (milestoneContext && !hasFetchedInitial.current) {
            hasFetchedInitial.current = true;
            fetchNextQuestion([]);
        }
    }, [milestoneContext, type]);

    const handleSubmitAnswer = async (answer) => {
        try {
            const currentQuestion = questions[currentIndex];
            const isCorrect = answer === currentQuestion.correctAnswer;

            if (isCorrect) {
                setScore(prev => prev + 1);
            }

            // Save to history so LLM knows what we already answered
            setPastHistory(prev => [
                ...prev, 
                { text: currentQuestion.text, isCorrect }
            ]);
            
            setIsAnswered(true);

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
        setIsAnswered(false);
        // We generate next question dynamically instead of moving index
        fetchNextQuestion(pastHistory);
    };

    const handleCompleteEarly = async () => {
        setQuizCompleted(true);
        try {
            // Update the SQLite database implicitly by taking advantage of our Context/Backend logic
            await completeMilestone(milestoneContext.id);
        } catch (e) {
            console.log("Error marking milestone complete:", e);
        }
    };

    if (loading && questions.length === 0) return <div>Generating your personalized first question...</div>;
    if (error && questions.length === 0) return <div className="error">{error}</div>;
    
    if (quizCompleted) {
        const currentMilestoneIndex = milestones.findIndex(m => String(m.id) === String(milestoneContext.id));
        const nextMilestone = milestones[currentMilestoneIndex + 1];

        return (
            <div className="quiz-summary">
                <h2>Quiz Session Completed!</h2>
                <p>Questions Answered: {questions.length}</p>
                <p>Total Correct: {score}</p>
                <p>Accuracy: {Math.round((score / questions.length) * 100) || 0}%</p>
                <div className="summary-actions" style={{ marginTop: '20px', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                    <button onClick={() => navigate(`/milestone/${milestoneContext.id}`)}>
                        Review Milestone
                    </button>

                    {nextMilestone && (
                        <button
                            onClick={() => navigate(`/milestone/${nextMilestone.id}`)}
                            style={{ backgroundColor: '#4CAF50' }}
                        >
                            Start Next: {nextMilestone.title}
                        </button>
                    )}

                    <button onClick={() => navigate('/dashboard')}>
                        Course Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="quiz-container">
            <div className="quiz-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                <span>Question {currentIndex + 1}</span>
                <span>Score: {Math.max(0, score)}/{questions.length}</span>
            </div>

            {questions[currentIndex] && (
                <Question
                    key={currentIndex}
                    question={questions[currentIndex]}
                    onSubmit={handleSubmitAnswer}
                />
            )}

            {loading && currentIndex >= questions.length && (
                <div style={{ marginTop: '20px', textAlign: 'center' }}>
                    <div className="spinner"></div>
                    <p style={{ marginTop: '10px', color: '#666' }}>Analyzing history & generating specific question...</p>
                </div>
            )}

            <div style={{ marginTop: '20px', display: 'flex', gap: '15px' }}>
                {!loading && isAnswered && questions[currentIndex] && (
                    <button onClick={handleNext} className="next-button" style={{ flex: 1 }}>
                        Create Another Question
                    </button>
                )}
                {!loading && isAnswered && questions.length > 0 && (
                    <button onClick={handleCompleteEarly} className="finish-button" style={{ flex: 1, backgroundColor: '#FF9800' }}>
                        Finish Quiz & Complete Milestone
                    </button>
                )}
            </div>
            {error && <div className="error" style={{ marginTop: '10px' }}>{error}</div>}
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
