import { useState } from 'react';
import PropTypes from 'prop-types';
import { llmService } from '../../services/llmService';
import MermaidChart from '../Shared/MermaidChart';

function Question({ question, onSubmit }) {
    const [selected, setSelected] = useState(null);
    const [submitted, setSubmitted] = useState(false);
    const [explanation, setExplanation] = useState('');
    const [diagramCode, setDiagramCode] = useState('');
    const [loadingDiagram, setLoadingDiagram] = useState(false);

    const handleVisualize = async () => {
        setLoadingDiagram(true);
        try {
            const data = await llmService.visualizeExplanation(explanation);
            if (data && data.mermaidCode) {
                const cleanedCode = data.mermaidCode.replace(/```mermaid/gi, "").replace(/```/g, "").trim();
                setDiagramCode(cleanedCode);
            }
        } catch (err) {
            console.error("Diagram error", err);
        }
        setLoadingDiagram(false);
    };

    const handleSubmit = async () => {
        setSubmitted(true);
        const result = await onSubmit(selected);
        if (result && result.explanation) {
            setExplanation(result.explanation);
        }
    };

    if (!question) return null;

    return (
        <div className="question-container">
            <h2>{question.text}</h2>

            <div className="options-list">
                {question.options.map((option, index) => (
                    <button
                        key={index}
                        onClick={() => !submitted && setSelected(option)}
                        className={`
              option-button 
              ${selected === option ? 'selected' : ''}
              ${submitted && option === question.correctAnswer ? 'correct' : ''}
              ${submitted && selected === option && option !== question.correctAnswer ? 'incorrect' : ''}
            `}
                        disabled={submitted}
                    >
                        {option}
                    </button>
                ))}
            </div>

            {!submitted ? (
                <button
                    onClick={handleSubmit}
                    disabled={!selected}
                    className="submit-button"
                >
                    Submit Answer
                </button>
            ) : (
                <div className="explanation-panel">
                    <h3>Explanation</h3>
                    <p>{explanation}</p>
                    
                    {explanation && !diagramCode && (
                        <button 
                            onClick={handleVisualize} 
                            disabled={loadingDiagram} 
                            className="submit-button" 
                            style={{marginTop: '10px', backgroundColor: '#607D8B'}}
                        >
                            {loadingDiagram ? 'Generating Visualization...' : 'Visualize Explanation'}
                        </button>
                    )}
                    
                    {diagramCode && (
                        <div style={{marginTop: '15px'}}>
                            <h4>Visualization</h4>
                            <MermaidChart chartCode={diagramCode} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

Question.propTypes = {
    question: PropTypes.shape({
        text: PropTypes.string.isRequired,
        options: PropTypes.arrayOf(PropTypes.string).isRequired,
        correctAnswer: PropTypes.string,
        explanation: PropTypes.string, // For initial explanation if provided
    }).isRequired,
    onSubmit: PropTypes.func.isRequired,
};

export default Question;
