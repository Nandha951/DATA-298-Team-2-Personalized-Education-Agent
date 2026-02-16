import { useNavigate } from 'react-router-dom';
import PathInput from '../components/LearningPath/PathInput';
import Navbar from '../components/Shared/Navbar';
import { useLearningPath } from '../context/LearningPathContext';

function Home() {
    const navigate = useNavigate();
    const { createNewPath } = useLearningPath();

    const handlePathGenerated = (milestones, query) => {
        createNewPath(query, milestones);
        navigate('/dashboard');
    };

    return (
        <div className="home-page">
            <Navbar />
            <div className="hero-section">
                <PathInput onPathGenerated={handlePathGenerated} />
            </div>
        </div>
    );
}

export default Home;
