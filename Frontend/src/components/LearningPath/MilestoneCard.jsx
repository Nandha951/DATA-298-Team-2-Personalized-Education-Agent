import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';

function MilestoneCard({ milestone, index, isActive, isLocked }) {
    // Add guard clause in case milestone object is incomplete
    if (!milestone) return null;

    return (
        <div className={`milestone-card ${isActive ? 'active' : ''} ${isLocked ? 'locked' : ''}`}>
            <div className="milestone-number">{index + 1}</div>
            <h3>{milestone.title}</h3>

            <ul className="topics-list">
                {milestone.topics && milestone.topics.map((topic, i) => (
                    <li key={i}>{topic}</li>
                ))}
            </ul>

            <div className="progress-bar">
                <div
                    className="progress-fill"
                    style={{ width: `${milestone.completed ? 100 : (milestone.progress || 0)}%` }}
                />
            </div>

            {milestone.completed && (
                <span className="badge" style={{ backgroundColor: '#4CAF50', marginRight: '5px' }}>Completed</span>
            )}

            {milestone.hasFinetuning && (
                <span className="badge">Fine-tuned Content</span>
            )}

            {!isLocked && (
                <Link to={`/milestone/${milestone.id}`}>
                    <button style={{ marginTop: '10px' }}>{milestone.completed ? 'Review' : 'Start Learning'}</button>
                </Link>
            )}
        </div>
    );
}

MilestoneCard.propTypes = {
    milestone: PropTypes.shape({
        id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
        title: PropTypes.string.isRequired,
        topics: PropTypes.arrayOf(PropTypes.string),
        progress: PropTypes.number,
        hasFinetuning: PropTypes.bool,
    }).isRequired,
    index: PropTypes.number.isRequired,
    isActive: PropTypes.bool,
    isLocked: PropTypes.bool,
};

export default MilestoneCard;
