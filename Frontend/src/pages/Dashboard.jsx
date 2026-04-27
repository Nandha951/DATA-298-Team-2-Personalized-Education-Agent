import { Link } from 'react-router-dom';
import Navbar from '../components/Shared/Navbar';
import MilestoneList from '../components/LearningPath/MilestoneList';
import PathAdjuster from '../components/LearningPath/PathAdjuster';
import { useLearningPath } from '../context/LearningPathContext';

function Dashboard() {
    const { milestones, currentMilestoneId, learningPaths, currentPathId, switchPath, deletePath } = useLearningPath();

    return (
        <div className="dashboard-page">
            <Navbar />
            <div className="main-content">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h1>Your Dashboard</h1>
                    <Link to="/create-path"><button style={{ padding: '8px 16px' }}>+ New Path</button></Link>
                </div>

                {learningPaths && learningPaths.length > 0 && (
                    <div className="path-selector" style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '20px', padding: '15px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <label style={{ fontWeight: 'bold' }}>Current Path:</label>
                        <select
                            value={currentPathId || ''}
                            onChange={(e) => switchPath(e.target.value)}
                            style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd', minWidth: '250px' }}
                        >
                            {learningPaths.map(path => (
                                <option key={path.id} value={path.id}>
                                    {path.topic || path.title || "Untitled Path"} ({new Date(path.createdAt).toLocaleDateString()})
                                </option>
                            ))}
                        </select>
                        <button 
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                deletePath(currentPathId);
                            }}
                            style={{ padding: '8px 12px', background: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                        >
                            Delete Path
                        </button>
                    </div>
                )}

                <PathAdjuster />

                {milestones.length > 0 ? (
                    <MilestoneList milestones={milestones} currentMilestone={currentMilestoneId} />
                ) : (
                    <div className="empty-state">
                        <p>No active learning path found. Go to <Link to="/create-path">Create Path</Link> to create a new one.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

export default Dashboard;
