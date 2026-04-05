import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Shared/Navbar';

function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to sign up');
      }

      // Store JWT token for future authenticated requests
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Navbar />
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '100px' }}>
        <div style={{ width: '100%', maxWidth: '400px', padding: '20px', background: 'white', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>Create an Account</h2>
          <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <input 
              type="text" 
              placeholder="Full Name" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              required 
              style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
            <input 
              type="email" 
              placeholder="Email Address" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
              style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
            <input 
              type="password" 
              placeholder="Password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
              style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
            {error && <div style={{ color: '#d32f2f', textAlign: 'center', fontSize: '14px', background: '#ffebee', padding: '10px', borderRadius: '4px' }}>{error}</div>}
            <button type="submit" disabled={loading} style={{ padding: '10px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Creating Account...' : 'Sign Up'}
            </button>
          </form>
          <p style={{ textAlign: 'center', marginTop: '15px', fontSize: '14px' }}>
            Already have an account? <Link to="/login">Log in here</Link>
          </p>
        </div>
      </div>
    </>
  );
}

export default Signup;
