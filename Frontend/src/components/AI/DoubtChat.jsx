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
        <div className="doubt-chat" style={{ display: 'flex', flexDirection: 'column', height: '100%', margin: 0, border: 'none', boxShadow: 'none', background: 'transparent' }}>
            <div className="chat-header" style={{ flexShrink: 0, background: 'transparent', borderBottom: '1px solid var(--border-color)', padding: '0 0 10px 0', fontFamily: 'Outfit', color: 'var(--text-main)' }}>Your Tutor AI - Specialized Memory</div>

            <div className="messages-container" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '15px 5px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'transparent' }}>
                {messages.map((msg, i) => (
                    <div key={i} className={`message ${msg.role}`} style={{ 
                        padding: '12px 16px', 
                        borderRadius: '12px',
                        background: msg.role === 'ai' ? 'var(--surface-color)' : 'var(--primary-light)',
                        border: msg.role === 'ai' ? '1px solid var(--border-color)' : 'none',
                        color: msg.role === 'ai' ? 'var(--text-main)' : 'var(--primary-hover)',
                        alignSelf: msg.role === 'ai' ? 'flex-start' : 'flex-end',
                        maxWidth: '90%',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                    }}>
                        <div className="markdown-body" style={{ fontSize: '0.9rem', lineHeight: '1.5' }}>
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                    </div>
                ))}
                {loading && <div className="loading" style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.85rem' }}>AI is looking up your documents...</div>}
            </div>

            <div className="input-container" style={{ flexShrink: 0, display: 'flex', gap: '8px', padding: '15px 0 0 0', borderTop: '1px solid var(--border-color)', background: 'transparent' }}>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => {
                        if (e.key === 'Enter') handleAsk();
                    }}
                    placeholder="Ask about this milestone..."
                    disabled={loading}
                    style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', minWidth: 0, fontSize: '0.9rem', fontFamily: 'Inter' }}
                />
                <button onClick={handleAsk} disabled={loading || !input.trim()} style={{ padding: '8px 16px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', flexShrink: 0, fontWeight: '600' }}>
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
