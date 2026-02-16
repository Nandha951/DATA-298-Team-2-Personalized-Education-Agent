import { useState } from 'react';
import PropTypes from 'prop-types';
import { llmService } from '../../services/llmService';

function DoubtChat({ milestoneContext }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);

    const handleAsk = async () => {
        if (!input.trim()) return;

        const userMessage = { role: 'user', content: input };
        setMessages([...messages, userMessage]);
        setInput('');
        setLoading(true);

        try {
            const data = await llmService.getDoubtAnswer(input, milestoneContext);

            const aiContent = data.answer || "Sorry, I couldn't get an answer.";
            const aiMessage = { role: 'ai', content: aiContent };
            setMessages(prev => [...prev, aiMessage]);
        } catch (err) {
            console.error('Error asking question:', err);
            const errorMessage = { role: 'ai', content: err.message || 'Connection error. Please try again later.' };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="doubt-chat">
            <div className="chat-header">Ask Your Doubt</div>

            <div className="messages-container">
                {messages.map((msg, i) => (
                    <div key={i} className={`message ${msg.role}`}>
                        {msg.content}
                    </div>
                ))}
                {loading && <div className="loading">AI is thinking...</div>}
            </div>

            <div className="input-container">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAsk()}
                    placeholder="Ask anything..."
                    disabled={loading}
                />
                <button onClick={handleAsk} disabled={loading || !input.trim()}>
                    Send
                </button>
            </div>
        </div>
    );
}

DoubtChat.propTypes = {
    milestoneContext: PropTypes.string,
};

export default DoubtChat;
