import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import MilestoneDetail from './pages/MilestoneDetail';
import QuizPage from './pages/QuizPage';
import './styles/global.css';

import { LearningPathProvider } from './context/LearningPathContext';

function App() {
  return (
    <LearningPathProvider>
      <Router>
        <div className="App">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/milestone/:id" element={<MilestoneDetail />} />
            <Route path="/quiz/:milestoneId/:type" element={<QuizPage />} />
          </Routes>
        </div>
      </Router>
    </LearningPathProvider>
  );
}

export default App;
