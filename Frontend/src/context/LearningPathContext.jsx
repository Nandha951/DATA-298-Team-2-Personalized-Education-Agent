import { createContext, useContext, useState, useEffect } from "react";
import { llmService } from "../services/llmService";


const LearningPathContext = createContext();

export const LearningPathProvider = ({ children }) => {
    const [learningPaths, setLearningPaths] = useState(() => {
        const savedPaths = localStorage.getItem("learning_paths");
        if (savedPaths) return JSON.parse(savedPaths);

        // Migration for legacy single path
        const oldPath = localStorage.getItem("learning_path");
        if (oldPath) {
            const milestones = JSON.parse(oldPath);
            if (milestones.length > 0) {
                const initialPath = {
                    id: Date.now().toString(),
                    title: "My First Learning Path",
                    milestones: milestones,
                    createdAt: new Date().toISOString()
                };
                return [initialPath];
            }
        }
        return [];
    });

    const [currentPathId, setCurrentPathId] = useState(() => {
        return localStorage.getItem("current_path_id") || (learningPaths.length > 0 ? learningPaths[0].id : null);
    });

    const [selectedProvider, setSelectedProvider] = useState(() => {
        return localStorage.getItem("llm_provider") || 'gemini';
    });

    // Derived state for current path's milestones
    const currentPath = learningPaths.find(p => p.id === currentPathId);
    const milestones = currentPath ? currentPath.milestones : [];

    // Helper to get current milestone ID from the milestones array
    const currentMilestoneId = milestones.find(m => !m.completed && !m.locked)?.id || (milestones.length > 0 ? milestones[milestones.length - 1].id : null);

    useEffect(() => {
        // Initialize provider on mount
        llmService.setProvider(selectedProvider);
    }, [selectedProvider]);

    const changeProvider = (provider) => {
        setSelectedProvider(provider);
        localStorage.setItem("llm_provider", provider);
        llmService.setProvider(provider);
    };

    useEffect(() => {
        localStorage.setItem("learning_paths", JSON.stringify(learningPaths));
    }, [learningPaths]);

    useEffect(() => {
        if (currentPathId) {
            localStorage.setItem("current_path_id", currentPathId);
        }
    }, [currentPathId]);

    const createNewPath = (title, newMilestones) => {
        const newPath = {
            id: Date.now().toString(),
            title: title || "New Learning Path",
            milestones: newMilestones,
            createdAt: new Date().toISOString()
        };
        setLearningPaths(prev => [...prev, newPath]);
        setCurrentPathId(newPath.id);
    };

    const switchPath = (id) => {
        if (learningPaths.some(p => p.id === id)) {
            setCurrentPathId(id);
        }
    };

    const updatePathMilestones = (pathId, updatedMilestones) => {
        setLearningPaths(prev => prev.map(path => {
            if (path.id === pathId) {
                return { ...path, milestones: updatedMilestones };
            }
            return path;
        }));
    };

    // Legacy support wrapper - sets milestones for CURRENT path
    const setMilestonesWrapper = (newMilestones) => {
        if (!currentPathId) {
            createNewPath("Generated Path", newMilestones);
        } else {
            updatePathMilestones(currentPathId, newMilestones);
        }
    };

    const updateMilestone = (id, updatedData) => {
        if (!currentPathId) return;

        const updatedMilestones = milestones.map((m) =>
            (String(m.id) === String(id) ? { ...m, ...updatedData } : m)
        );
        updatePathMilestones(currentPathId, updatedMilestones);
    };

    const getMilestoneById = (id) => {
        return milestones.find((m) => String(m.id) === String(id));
    };

    const completeMilestone = (id) => {
        if (!currentPathId) return;

        const index = milestones.findIndex((m) => String(m.id) === String(id));
        if (index === -1) return;

        console.log(`Completing milestone ${id} at index ${index}`);

        // Mark current as complete
        const updatedMilestones = [...milestones];
        updatedMilestones[index] = { ...updatedMilestones[index], completed: true, progress: 100 };

        // Unlock next milestone if it exists
        if (index < updatedMilestones.length - 1) {
            updatedMilestones[index + 1] = { ...updatedMilestones[index + 1], locked: false };
        }

        updatePathMilestones(currentPathId, updatedMilestones);
    };

    return (
        <LearningPathContext.Provider
            value={{
                milestones,
                learningPaths,
                currentPathId,
                createNewPath,
                switchPath,
                setMilestones: setMilestonesWrapper,
                updateMilestone,
                currentMilestoneId,
                completeMilestone,
                getMilestoneById,
                selectedProvider,
                changeProvider,
            }}
        >
            {children}
        </LearningPathContext.Provider>
    );
};

export const useLearningPath = () => {
    const context = useContext(LearningPathContext);
    if (!context) {
        throw new Error("useLearningPath must be used within a LearningPathProvider");
    }
    return context;
};
