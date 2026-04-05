import { Link } from 'react-router-dom';
import { useLearningPath } from '../../context/LearningPathContext';

function Navbar() {
    const { selectedProvider, changeProvider } = useLearningPath();

    return (
        <nav className="navbar">
            <div className="logo">
                <Link to="/">EduAgent</Link>
            </div>
            <div className="nav-controls" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <ul className="nav-links">
                    <li><Link to="/">Home</Link></li>
                    <li><Link to="/dashboard">Dashboard</Link></li>
                    <li><Link to="/login" style={{ marginLeft: '10px', padding: '5px 10px', background: '#f0f0f0', borderRadius: '4px', textDecoration: 'none' }}>Log In</Link></li>
                    <li><Link to="/signup" style={{ padding: '5px 10px', background: '#4CAF50', color: 'white', borderRadius: '4px', textDecoration: 'none' }}>Sign Up</Link></li>
                </ul>
                <div className="provider-selector">
                    <select
                        value={selectedProvider}
                        onChange={(e) => changeProvider(e.target.value)}
                        className="provider-select"
                        style={{ padding: '5px', borderRadius: '4px', border: '1px solid #ccc' }}
                    >
                        <option value="gemini">Google Gemini</option>
                        <option value="openai">OpenAI (GPT-4o)</option>
                        <option value="deepseek">Deepseek V3</option>
                    </select>
                </div>
            </div>
        </nav>
    );
}

export default Navbar;
