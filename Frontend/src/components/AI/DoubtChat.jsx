import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import ReactMarkdown from 'react-markdown';
import { llmService } from '../../services/llmService';
import { useVoiceAssistant } from '../../hooks/useVoiceAssistant';
import { BACKEND_URL } from '../../services/config';

function DoubtChat({ milestoneId, milestoneContext }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const abortControllerRef = useRef(null);
    const messagesEndRef = useRef(null);

    const { isListening, isSpeaking, startListening, stopListening, speak } = useVoiceAssistant((transcript, isFinal) => {
        if (isFinal) {
            setInput('');
            handleAsk(transcript);
        } else {
            setInput(transcript);
            if (abortControllerRef.current) abortControllerRef.current.abort();
        }
    });

    const handleStopAll = () => {
        stopListening();
        window.speechSynthesis.cancel();
        if (abortControllerRef.current) abortControllerRef.current.abort();
        setLoading(false);
        setInput('');
    };

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    useEffect(() => {
        const fetchHistory = async () => {
            const token = localStorage.getItem('auth_token');
            if (!token || !milestoneId || !BACKEND_URL) return;
            try {
                const res = await fetch(`${BACKEND_URL}/api/chats/${milestoneId}`, {
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
        if (!token || !BACKEND_URL) return;
        await fetch(`${BACKEND_URL}/api/chats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ role, content, contextRef: milestoneId })
        }).catch(err => console.error("Failed to save chat message:", err));
    };

    const handleAsk = async (forcedInput) => {
        const currentInput = typeof forcedInput === 'string' ? forcedInput : input;
        if (!currentInput.trim()) return;

        if (abortControllerRef.current) abortControllerRef.current.abort();
        abortControllerRef.current = new AbortController();
        const currentAbort = abortControllerRef.current;

        setMessages(prev => [...prev, { role: 'user', content: currentInput }]);
        setInput('');
        setLoading(true);
        saveMessage('user', currentInput);

        setMessages(prev => [...prev, { role: 'ai', content: '' }]);

        let buffer = '';
        let displayContent = '';
        let isStreamDone = false;
        let streamError = null;

        const provider = llmService.getCurrentProvider();
        const isFinetuned = provider === 'finetuned-deepseek' || provider === 'finetuned-mistral';

        if (isFinetuned) {
            setMessages(prev => {
                const msgs = [...prev];
                msgs[msgs.length - 1] = { role: 'ai', content: '*Connecting to finetuned model… this may take 25-45s*' };
                return msgs;
            });
        }

        try {
            const stream = llmService.streamDoubtAnswer(currentInput, milestoneContext);

            (async () => {
                try {
                    for await (const chunk of stream) { buffer += chunk; }
                } catch (e) {
                    streamError = e;
                } finally {
                    isStreamDone = true;
                }
            })();

            while (!isStreamDone || displayContent.length < buffer.length) {
                if (currentAbort.signal.aborted) break;

                if (streamError) throw streamError;

                if (displayContent.length < buffer.length) {
                    const step = buffer.slice(displayContent.length, displayContent.length + 4);
                    displayContent += step;
                    setMessages(prev => {
                        const msgs = [...prev];
                        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: displayContent };
                        return msgs;
                    });
                }

                await new Promise(r => setTimeout(r, 15));
            }

            if (!currentAbort.signal.aborted) {
                saveMessage('ai', displayContent);
                speak(displayContent, null, true);
            }

        } catch (err) {
            console.error('DoubtChat error:', err);
            const msg = err.message?.includes('401') || err.message?.includes('unauthorized')
                ? 'Session expired. Please log out and log in again.'
                : err.message?.includes('finetuned') || err.message?.includes('TIMEOUT')
                ? 'Finetuned model timed out. It may still be cold-starting — try again in 30s.'
                : err.message || 'Connection error. Please try again.';
            setMessages(prev => {
                const msgs = [...prev];
                msgs[msgs.length - 1] = { role: 'ai', content: `*Error: ${msg}*` };
                return msgs;
            });
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleAsk();
        }
    };

    const provider = llmService.getCurrentProvider();
    const isFinetuned = provider === 'finetuned-deepseek' || provider === 'finetuned-mistral';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '8px' }}>
            {/* Message history */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px', minHeight: '80px', maxHeight: '240px' }}>
                {messages.length === 0 && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', margin: 'auto 0', fontStyle: 'italic' }}>
                        Ask anything about this milestone…
                    </p>
                )}
                {messages.map((msg, i) => (
                    <div key={i} style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        background: msg.role === 'user' ? 'var(--primary-light)' : 'var(--bg-color)',
                        border: msg.role === 'ai' ? '1px solid var(--border-color)' : 'none',
                        fontSize: '0.88rem',
                        lineHeight: '1.5',
                        color: 'var(--text-main)',
                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '95%'
                    }}>
                        {msg.role === 'ai'
                            ? <ReactMarkdown>{msg.content || (loading && i === messages.length - 1 ? '▋' : '')}</ReactMarkdown>
                            : msg.content
                        }
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Text input row */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
                <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a question…"
                    disabled={loading}
                    rows={2}
                    style={{
                        flex: 1, padding: '8px 10px', borderRadius: '8px',
                        border: '1px solid var(--border-color)', resize: 'none',
                        fontFamily: 'Inter', fontSize: '0.88rem',
                        background: 'var(--bg-color)', color: 'var(--text-main)',
                        opacity: loading ? 0.6 : 1
                    }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <button
                        onClick={loading ? handleStopAll : handleAsk}
                        style={{
                            padding: '8px 12px', borderRadius: '8px', border: 'none',
                            background: loading ? '#ef4444' : 'var(--primary)',
                            color: 'white', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600'
                        }}
                    >
                        {loading ? '■' : '↑'}
                    </button>
                    <button
                        onClick={(isListening || isSpeaking) ? handleStopAll : startListening}
                        title={isSpeaking ? "Stop Reading" : isListening ? "Stop Listening" : "Voice Input"}
                        style={{
                            padding: '8px 12px', borderRadius: '8px', border: 'none',
                            background: (isListening || isSpeaking) ? '#ef4444' : 'var(--surface-color)',
                            color: (isListening || isSpeaking) ? 'white' : 'var(--text-muted)',
                            border: '1px solid var(--border-color)',
                            cursor: 'pointer', fontSize: '1rem'
                        }}
                    >
                        {isSpeaking ? '🔇' : isListening ? '🛑' : '🎙️'}
                    </button>
                </div>
            </div>
        </div>
    );
}

DoubtChat.propTypes = {
    milestoneId: PropTypes.string.isRequired,
};

export default DoubtChat;
