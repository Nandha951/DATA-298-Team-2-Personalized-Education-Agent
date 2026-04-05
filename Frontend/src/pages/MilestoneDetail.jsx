import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/Shared/Navbar';
import DoubtChat from '../components/AI/DoubtChat';
import { useLearningPath } from '../context/LearningPathContext';
import { llmService } from '../services/llmService';
import { llamaParseService } from '../services/llamaParseService';
import ReactMarkdown from 'react-markdown';
import PathAdjuster from '../components/LearningPath/PathAdjuster';

function MilestoneDetail() {
    const { id } = useParams();
    const { getMilestoneById, updateMilestone } = useLearningPath();
    const [milestone, setMilestone] = useState(null);
    const [loading, setLoading] = useState(true);
    const [generatingContent, setGeneratingContent] = useState(false);

    const [selection, setSelection] = useState({ text: '', x: 0, y: 0 });
    const [actionState, setActionState] = useState({ type: null, loading: false, result: '', chatHistory: [], error: '' }); // type: 'ask' | 'personalize'
    const [actionInput, setActionInput] = useState('');
    const [actionFile, setActionFile] = useState(null);

    useEffect(() => {
        const found = getMilestoneById(id);
        setMilestone(found);
        setLoading(false);

        if (found && !found.detailedContent && !generatingContent) {
            generateContent(found);
        }
    }, [id, getMilestoneById, generatingContent]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (!e.target.closest('.selection-toolbar') && !e.target.closest('.action-modal-overlay')) {
                if (window.getSelection().isCollapsed) {
                     setSelection({ text: '', x: 0, y: 0 });
                }
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const generateContent = async (m) => {
        setGeneratingContent(true);
        try {
            const result = await llmService.generateMilestoneContent(m);
            if (result && result.detailedContent) {
                updateMilestone(m.id, { detailedContent: result.detailedContent });
                setMilestone(prev => ({ ...prev, detailedContent: result.detailedContent }));
            }
        } catch (err) {
            console.error("Failed to generate detailed content", err);
        } finally {
            setGeneratingContent(false);
        }
    };

    const handleMouseUp = () => {
        const sel = window.getSelection();
        if (sel && sel.toString().trim().length > 0) {
            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            setSelection({
                text: sel.toString().trim(),
                x: rect.left + window.scrollX + rect.width / 2,
                y: rect.top + window.scrollY - 10
            });
        }
    };

    const handlePersonalize = async () => {
        if (!actionInput.trim() && !actionFile) return;
        setActionState(prev => ({ ...prev, loading: true, error: '' }));
        
        let promptText = actionInput;
        try {
            if (actionFile) {
                const parsedMarkdown = await llamaParseService.parseFile(actionFile);
                promptText += `\n\nAttached Context Document:\n${parsedMarkdown}`;
                setActionFile(null);
            }

            const data = await llmService.personalizeContent(selection.text, promptText, milestone.detailedContent);
            if (data && data.replacementText) {
                const targetText = data.originalTextToReplace || selection.text;
                let newContent = milestone.detailedContent;
                
                if (newContent.includes(targetText)) {
                    newContent = newContent.replace(targetText, data.replacementText);
                } else if (newContent.includes(selection.text)) {
                    newContent = newContent.replace(selection.text, data.replacementText);
                } else {
                    console.warn("Could not find exact text to replace. Appending to bottom as fallback.");
                    newContent += `\n\n### Personalized Addition\n${data.replacementText}`;
                }

                updateMilestone(id, { detailedContent: newContent });
                setMilestone(prev => ({ ...prev, detailedContent: newContent }));
                closeModals();
            }
        } catch (err) {
            setActionState(prev => ({ ...prev, loading: false, error: 'Failed to personalize content.' }));
        }
    };

    const handleAsk = async () => {
        if (!actionInput.trim()) return;
        
        const questionText = actionInput;
        setActionInput('');

        // Ensure we have a thread ID
        const threadIdToUse = actionState.activeThreadId || `${id}_selection_${Date.now()}`;
        
        setActionState(prev => ({ 
            ...prev, 
            loading: true, 
            error: '',
            activeThreadId: threadIdToUse,
            chatHistory: [...prev.chatHistory, { role: 'user', content: questionText }] 
        }));
        
        try {
            const data = await llmService.getDoubtAnswer(questionText);
            if (data && data.answer) {
                 setActionState(prev => ({ 
                     ...prev, 
                     loading: false, 
                     chatHistory: [...prev.chatHistory, { role: 'ai', content: data.answer }]
                 }));
                 // Save messages to backend
                 saveChatToBackend('user', questionText, threadIdToUse);
                 saveChatToBackend('ai', data.answer, threadIdToUse);
            }
        } catch (err) {
            setActionState(prev => ({ ...prev, loading: false, error: 'Failed to get answer.' }));
        }
    };

    const saveChatToBackend = async (role, content, threadId) => {
        const token = localStorage.getItem('auth_token');
        if (!token) return;
        
        // Also update local thread state so it immediately appears in sidebar if new
        setActionState(prev => {
            const updatedThreads = { ...prev.threads };
            if (!updatedThreads[threadId]) updatedThreads[threadId] = [];
            updatedThreads[threadId] = [...updatedThreads[threadId], { role, content }];
            return { ...prev, threads: updatedThreads };
        });

        await fetch('/api/chats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ role, content, contextRef: threadId })
        });
    };

    const closeModals = () => {
        setActionState({ type: null, loading: false, result: '', chatHistory: [], error: '' });
        setActionInput('');
        setActionFile(null);
        setSelection({ text: '', x: 0, y: 0 });
        window.getSelection().removeAllRanges();
    };

    if (loading) return <div>Loading milestone...</div>;
    if (!milestone) return (
        <div className="error-page">
            <Navbar />
            <div className="content">
                <p>Milestone not found. Please return to the dashboard.</p>
                <Link to="/dashboard">Back to Dashboard</Link>
            </div>
        </div>
    );

    return (
        <div className="milestone-detail-page">
            <Navbar />
            <div className="content-container">
                <Link to="/dashboard" className="back-link">← Back to Dashboard</Link>
                <h1>{milestone.title}</h1>

                <PathAdjuster />

                <div className="milestone-content">
                    <div className="topics-section">
                        <h2>Topics Covered</h2>
                        <ul>
                            {milestone.topics && milestone.topics.map((topic, i) => (
                                <li key={i}>{topic}</li>
                            ))}
                        </ul>

                        {generatingContent && !milestone.detailedContent && (
                            <div className="loading-content">
                                Generating detailed lesson... This may take a few seconds.
                            </div>
                        )}

                        <div 
                            className="content-text" 
                            style={{ margin: '1rem 0', lineHeight: '1.8', position: 'relative' }}
                            onMouseUp={handleMouseUp}
                        >
                            {milestone.detailedContent ? (
                                <ReactMarkdown>{milestone.detailedContent}</ReactMarkdown>
                            ) : (
                                <p>{milestone.content || "Content is being prepared..."}</p>
                            )}
                        </div>

                        {/* Floating Selection Toolbar */}
                        {selection.text && actionState.type === null && (
                            <div 
                                className="selection-toolbar"
                                style={{
                                    position: 'absolute',
                                    top: `${selection.y}px`,
                                    left: `${selection.x}px`,
                                    transform: 'translate(-50%, -100%)',
                                    background: '#333',
                                    color: 'white',
                                    padding: '8px',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    gap: '10px',
                                    zIndex: 1000,
                                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                                }}
                            >
                                <button 
                                    onClick={async () => {
                                        const newThreadId = `${id}_selection_${Date.now()}`;
                                        setActionState({ type: 'ask', loading: true, result: '', chatHistory: [], error: '', activeThreadId: newThreadId, threads: {} });
                                        try {
                                            const token = localStorage.getItem('auth_token');
                                            if (token) {
                                                const res = await fetch(`/api/chats/${id}/threads`, {
                                                    headers: { 'Authorization': `Bearer ${token}` }
                                                });
                                                if (res.ok) {
                                                    const threadsData = await res.json();
                                                    setActionState(prev => ({ 
                                                        ...prev, 
                                                        loading: false,
                                                        threads: threadsData
                                                    }));
                                                    return;
                                                }
                                            }
                                        } catch (e) {
                                            console.error("Failed to load modal chat history", e);
                                        }
                                        setActionState(prev => ({ ...prev, loading: false }));
                                    }}
                                    style={{ background: 'transparent', color: 'white', border: 'none', padding: '5px 10px', cursor: 'pointer' }}
                                >
                                    Ask Question
                                </button>
                                <button 
                                    onClick={() => setActionState({ type: 'personalize', loading: false, result: '', chatHistory: [], error: '' })}
                                    style={{ background: 'transparent', color: 'white', border: 'none', borderLeft: '1px solid #555', padding: '5px 10px', cursor: 'pointer' }}
                                >
                                    Personalize Content
                                </button>
                            </div>
                        )}

                        {/* Action Modal (Ask or Personalize) - OVERLAY */}
                        {actionState.type !== null && (
                            <div className="action-modal-overlay" style={{
                                position: 'fixed',
                                top: 0, left: 0, right: 0, bottom: 0,
                                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                zIndex: 2000
                            }}>
                                <div className="action-modal" style={{ 
                                    background: '#fff', 
                                    borderRadius: '12px', 
                                    width: '90%', 
                                    maxWidth: '900px',
                                    height: '80vh',
                                    display: 'flex',
                                    boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}>
                                    {/* Sidebar for Past Threads */}
                                    {actionState.type === 'ask' && (
                                        <div style={{ width: '280px', background: '#f5f7fa', borderRight: '1px solid #ddd', padding: '15px', overflowY: 'auto' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                                <h3 style={{ margin: 0, fontSize: '18px' }}>Chat History</h3>
                                                <button 
                                                    onClick={() => {
                                                        const newThreadId = `${id}_selection_${Date.now()}`;
                                                        setActionState(prev => ({ 
                                                            ...prev, 
                                                            activeThreadId: newThreadId,
                                                            chatHistory: [] // Blank slate
                                                        }));
                                                    }}
                                                    style={{ padding: '6px 12px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                                                >
                                                    + New Text Chat
                                                </button>
                                            </div>

                                            {Object.keys(actionState.threads || {}).length === 0 ? (
                                                <p style={{ color: '#888', fontSize: '14px', textAlign: 'center', marginTop: '40px' }}>No past selection chats found.</p>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    {Object.entries(actionState.threads || {}).map(([threadId, messages]) => {
                                                        const isActive = actionState.activeThreadId === threadId;
                                                        // Get snippet of the very first user message for title
                                                        const firstMsg = messages.find(m => m.role === 'user')?.content || "Empty chat";
                                                        return (
                                                            <div 
                                                                key={threadId}
                                                                onClick={() => {
                                                                    setActionState(prev => ({
                                                                        ...prev,
                                                                        activeThreadId: threadId,
                                                                        chatHistory: messages
                                                                    }));
                                                                }}
                                                                style={{ 
                                                                    padding: '10px', 
                                                                    borderRadius: '6px', 
                                                                    background: isActive ? '#e3f2fd' : 'white',
                                                                    border: isActive ? '1px solid #90caf9' : '1px solid #eee',
                                                                    cursor: 'pointer',
                                                                    fontSize: '13px',
                                                                    whiteSpace: 'nowrap',
                                                                    overflow: 'hidden',
                                                                    textOverflow: 'ellipsis'
                                                                }}
                                                            >
                                                                <strong>{new Date(parseInt(threadId.split('_').pop()) || Date.now()).toLocaleDateString()}:</strong> {firstMsg}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Main Chat Area */}
                                    <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                            <h3 style={{ margin: 0 }}>{actionState.type === 'ask' ? 'Ask a Question about Highlighted Text' : 'Personalize Content'}</h3>
                                            <button 
                                                onClick={closeModals} 
                                                style={{ background: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888' }}
                                            >
                                                ×
                                            </button>
                                        </div>
                                        
                                        <p style={{ fontStyle: 'italic', color: '#666', marginBottom: '20px', padding: '10px', background: '#f5f5f5', borderRadius: '6px', borderLeft: '3px solid #ccc' }}>
                                            Selection Context: "{selection.text.substring(0, 100)}{selection.text.length > 100 ? '...' : ''}"
                                        </p>

                                        {actionState.type === 'ask' && actionState.chatHistory.length > 0 && (
                                            <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '15px', flex: 1 }}>
                                                {actionState.chatHistory.map((msg, i) => (
                                                    <div key={i} style={{ 
                                                        background: msg.role === 'ai' ? '#f8fdf8' : '#e3f2fd', 
                                                        padding: '15px', 
                                                        borderRadius: '8px', 
                                                        borderLeft: msg.role === 'ai' ? '4px solid #4CAF50' : '4px solid #2196F3' 
                                                    }}>
                                                        <strong style={{ color: msg.role === 'ai' ? '#2e7d32' : '#1565c0' }}>{msg.role === 'ai' ? 'Answer:' : 'You:'}</strong>
                                                        <div style={{ marginTop: '10px', lineHeight: '1.6' }} className="markdown-body">
                                                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div style={{ display: 'flex', gap: '15px', flexDirection: 'column', marginTop: 'auto' }}>
                                            <textarea 
                                                value={actionInput}
                                                onChange={(e) => setActionInput(e.target.value)}
                                                placeholder={actionState.type === 'ask' ? "Type your question here..." : "e.g., Explain this using an analogy?"}
                                                rows="3"
                                                style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ccc', width: '100%', resize: 'vertical' }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && !e.shiftKey) {
                                                        e.preventDefault();
                                                        if (actionInput.trim() && !actionState.loading) {
                                                            actionState.type === 'ask' ? handleAsk() : handlePersonalize();
                                                        }
                                                    }
                                                }}
                                            />
                                            
                                            <button 
                                                onClick={actionState.type === 'ask' ? handleAsk : handlePersonalize}
                                                disabled={(!actionInput.trim()) || actionState.loading}
                                                style={{ width: '100%', padding: '12px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                                            >
                                                {actionState.loading ? 'Processing...' : (actionState.type === 'ask' ? 'Send' : 'Replace & Personalize')}
                                            </button>
                                        </div>
                                        {actionState.error && <p style={{ color: '#d32f2f', marginTop: '15px', textAlign: 'center' }}>{actionState.error}</p>}
                                    </div>
                                </div>
                            </div>
                        )}
                        
                    </div>

                    <div className="actions-section" style={{ margin: '2rem 0' }}>
                        {milestone.detailedContent && (
                            <Link to={`/quiz/${id}/initial`}>
                                <button className="quiz-btn">Take Initial Quiz</button>
                            </Link>
                        )}
                    </div>

                    <div className="doubt-section">
                        <h2>Need Help?</h2>
                        <DoubtChat milestoneId={id} />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default MilestoneDetail;
