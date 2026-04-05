import { useState } from 'react';
import PropTypes from 'prop-types';
import { llmService } from '../../services/llmService';
import { llamaParseService } from '../../services/llamaParseService';

function DoubtChat({ milestoneContext }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleAsk = async () => {
        if (!input.trim() && !file) return;

        const currentInput = input;
        const currentFile = file;

        // Show file name in user message if attached
        const userDisplayMsg = currentInput + (currentFile ? `\n\n[Attached: ${currentFile.name}]` : '');

        const userMessage = { role: 'user', content: userDisplayMsg };
        setMessages([...messages, userMessage]);
        setInput('');
        setFile(null);
        setLoading(true);

        try {
            let finalQuestionText = currentInput;
            if (currentFile) {
                const parsedMarkdown = await llamaParseService.parseFile(currentFile);
                finalQuestionText += `\n\nAttached Context Document Data:\n${parsedMarkdown}`;
            }

            const data = await llmService.getDoubtAnswer(finalQuestionText, milestoneContext);

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
                    <div key={i} className={`message ${msg.role}`} style={{ whiteSpace: 'pre-wrap' }}>
                        {msg.content}
                    </div>
                ))}
                {loading && <div className="loading">AI is thinking...</div>}
            </div>

            <div className="input-container" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={(e) => {
                            if (e.key === 'Enter') handleAsk();
                        }}
                        placeholder="Ask anything..."
                        disabled={loading}
                        style={{ flex: 1 }}
                    />
                    <button onClick={handleAsk} disabled={loading || (!input.trim() && !file)}>
                        Send
                    </button>
                </div>
                <div style={{ fontSize: '12px' }}>
                    <label style={{ marginRight: '8px', fontWeight: 'bold' }}>Attach File (LlamaParse):</label>
                    <input 
                        type="file" 
                        accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.csv,.html,.epub"
                        onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                                setFile(e.target.files[0]);
                            }
                        }}
                        disabled={loading}
                    />
                </div>
            </div>
        </div>
    );
}

DoubtChat.propTypes = {
    milestoneContext: PropTypes.string,
};

export default DoubtChat;
