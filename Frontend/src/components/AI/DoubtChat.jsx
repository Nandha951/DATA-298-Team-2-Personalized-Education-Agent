import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import ReactMarkdown from 'react-markdown';
import { llmService } from '../../services/llmService';

function DoubtChat({ milestoneId }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);

    // Load historical chats on mount
    useEffect(() => {
        const fetchHistory = async () => {
            const token = localStorage.getItem('auth_token');
            if (!token || !milestoneId) return;

            try {
                const res = await fetch(`/api/chats/${milestoneId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setMessages(data.map(c => ({ role: c.role, content: c.content })));
                }
            } catch (err) {
                console.error("Failed to fetch chat history:", err);
            }
        };
        fetchHistory();
    }, [milestoneId]);

    const saveMessage = async (role, content) => {
        const token = localStorage.getItem('auth_token');
        if (!token) return;

        await fetch('/api/chats', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ role, content, contextRef: milestoneId })
        }).catch(err => console.error("Failed to save chat message:", err));
    };

    const handleAsk = async () => {
        if (!input.trim() && !file) return;

        const currentInput = input;
        const userMessage = { role: 'user', content: currentInput };
        
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setFile(null);
        setLoading(true);

        // Optimistically save user message
        saveMessage('user', currentInput);

        try {
            // Add empty AI message placeholder for streaming
            setMessages(prev => [...prev, { role: 'ai', content: '' }]);

            let buffer = "";
            let displayContent = "";
            let isStreamDone = false;

            const stream = llmService.streamDoubtAnswer(currentInput);
            
            (async () => {
                try {
                    for await (const chunk of stream) { buffer += chunk; }
                } catch(e) { console.error(e); } 
                finally { isStreamDone = true; }
            })();
            
            while (!isStreamDone || displayContent.length < buffer.length) {
                if (displayContent.length < buffer.length) {
                    const stepText = buffer.slice(displayContent.length, displayContent.length + 4);
                    displayContent += stepText;
                    setMessages(prev => {
                        const newMessages = [...prev];
                        const lastIndex = newMessages.length - 1;
                        newMessages[lastIndex] = { ...newMessages[lastIndex], content: displayContent };
                        return newMessages;
                    });
                }
                await new Promise(r => setTimeout(r, 15));
            }

            saveMessage('ai', displayContent);
        } catch (err) {
            console.error('Error asking question:', err);
            const errorMessage = { role: 'ai', content: err.message || 'Connection error. Please try again later.' };
            setMessages(prev => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = errorMessage; // Replace empty stream placeholder
                return newMessages;
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="doubt-chat">
            <div className="chat-header">Your Tutor AI - Specialized Memory</div>

            <div className="messages-container" style={{ maxHeight: '400px', overflowY: 'auto', padding: '10px' }}>
                {messages.map((msg, i) => (
                    <div key={i} className={`message ${msg.role}`} style={{ 
                        marginBottom: '15px', 
                        padding: '10px', 
                        borderRadius: '8px',
                        background: msg.role === 'ai' ? '#f0f4f8' : '#e3f2fd',
                        borderLeft: msg.role === 'ai' ? '4px solid #1976d2' : '4px solid #2196f3'
                    }}>
                        <div className="markdown-body">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                    </div>
                ))}
                {loading && <div className="loading">AI is looking up your documents...</div>}
            </div>

            <div className="input-container" style={{ display: 'flex', gap: '8px', padding: '10px', borderTop: '1px solid #eee' }}>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => {
                        if (e.key === 'Enter') handleAsk();
                    }}
                    placeholder="Ask a question about this milestone..."
                    disabled={loading}
                    style={{ flex: 1, padding: '10px', borderRadius: '4px', border: '1px solid #ddd' }}
                />
                <button onClick={handleAsk} disabled={loading || !input.trim()} style={{ padding: '8px 16px', background: '#2196f3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                    Send
                </button>
            </div>
        </div>
    );
}

DoubtChat.propTypes = {
    milestoneId: PropTypes.string.isRequired,
};

export default DoubtChat;
