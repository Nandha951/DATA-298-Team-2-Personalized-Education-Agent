import { Link } from 'react-router-dom';
import Navbar from '../components/Shared/Navbar';
import MilestoneList from '../components/LearningPath/MilestoneList';
import PathAdjuster from '../components/LearningPath/PathAdjuster';
import { useLearningPath } from '../context/LearningPathContext';

function Dashboard() {
    const { milestones, currentMilestoneId, learningPaths, currentPathId, switchPath } = useLearningPath();

    return (
        <div className="dashboard-page">
            <Navbar />
            <div className="main-content">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h1>Your Dashboard</h1>
                    <Link to="/"><button style={{ padding: '8px 16px' }}>+ New Path</button></Link>
                </div>

                {learningPaths && learningPaths.length > 0 && (
                    <div className="path-selector" style={{ marginBottom: '20px', padding: '15px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <label style={{ marginRight: '10px', fontWeight: 'bold' }}>Current Path:</label>
                        <select
                            value={currentPathId || ''}
                            onChange={(e) => switchPath(e.target.value)}
                            style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd', minWidth: '250px' }}
                        >
                            {learningPaths.map(path => (
                                <option key={path.id} value={path.id}>
                                    {path.title} ({new Date(path.createdAt).toLocaleDateString()})
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                <PathAdjuster />

                {milestones.length > 0 ? (
                    <MilestoneList milestones={milestones} currentMilestone={currentMilestoneId} />
                ) : (
                    <div className="empty-state">
                        <p>No active learning path found. Go to <Link to="/">Home</Link> to create a new one.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

export default Dashboard;
