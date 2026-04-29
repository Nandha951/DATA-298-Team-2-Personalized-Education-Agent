const { spawn } = require('child_process');
const path = require('path');

let currentComplexity = null;
let mlxProcess = null;
let isReady = false;
let startPromise = null;

const MODELS = {
    low: {
        base: 'Qwen/Qwen3.5-4B',
        adapter: 'models/qwen3.5_4b/content/qwen3.5_4b_complete'
    },
    medium: {
        base: 'meta-llama/Llama-3.1-8B-Instruct',
        adapter: 'models/llama_3_1_adapter/llama_3_1_adapter'
    },
    high: {
        base: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
        adapter: 'models/deepseek/deepseek-r1-7b-finetuned/final_adapter'
    }
};

const MLX_PORT = 8080;

async function waitForServer() {
    console.log(`[MLX Manager] Polling for server readiness at http://localhost:${MLX_PORT}/v1/models...`);
    const maxRetries = 180; // Up to 3 minutes for large models
    const interval = 1000;

    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(`http://localhost:${MLX_PORT}/v1/models`);
            if (response.ok) {
                console.log(`[MLX Manager] Server is ready!`);
                isReady = true;
                return true;
            }
        } catch (err) {
            // Expected error while waiting
        }
        await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error("Timeout waiting for MLX server to become ready");
}

function stopCurrentModel() {
    if (mlxProcess) {
        console.log(`[MLX Manager] Stopping current MLX model...`);
        mlxProcess.kill('SIGKILL');
        mlxProcess = null;
    }
    isReady = false;
    currentComplexity = null;
}

async function ensureModel(complexity) {
    if (!MODELS[complexity]) {
        throw new Error(`Unknown complexity: ${complexity}`);
    }

    if (currentComplexity === complexity && isReady) {
        return;
    }

    // If another request is currently starting the SAME complexity, wait for it
    if (currentComplexity === complexity && startPromise) {
        await startPromise;
        return;
    }

    // If another request is starting a DIFFERENT complexity, wait for it to finish, then override
    if (startPromise) {
        await startPromise.catch(() => {});
    }

    // Double check after waiting
    if (currentComplexity === complexity && isReady) {
        return;
    }

    console.log(`[MLX Manager] Complexity change requested. Switching to model for '${complexity}' complexity...`);
    stopCurrentModel();

    startPromise = (async () => {
        const modelConfig = MODELS[complexity];
        const backendRoot = path.resolve(__dirname, '..');
        const adapterPath = path.join(backendRoot, modelConfig.adapter);

        console.log(`[MLX Manager] Starting MLX server with Base: ${modelConfig.base}, Adapter: ${adapterPath}`);

        mlxProcess = spawn('python3', [
            '-m', 'mlx_lm.server',
            '--model', modelConfig.base,
            '--adapter-path', adapterPath,
            '--port', MLX_PORT.toString()
        ], {
            cwd: backendRoot,
            env: { ...process.env }
        });

        mlxProcess.stdout.on('data', (data) => {
            console.log(`[MLX Server]: ${data}`);
        });

        mlxProcess.stderr.on('data', (data) => {
            console.error(`[MLX Server Error]: ${data}`);
        });

        mlxProcess.on('close', (code, signal) => {
            console.log(`[MLX Manager] MLX server exited with code ${code} and signal ${signal}`);
            if (currentComplexity === complexity) {
                isReady = false;
                currentComplexity = null;
            }
        });

        currentComplexity = complexity;
        await waitForServer();
    })();

    try {
        await startPromise;
    } finally {
        startPromise = null;
    }
}

process.on('SIGINT', () => {
    stopCurrentModel();
    process.exit();
});
process.on('SIGTERM', () => {
    stopCurrentModel();
    process.exit();
});

module.exports = {
    ensureModel,
    stopCurrentModel,
    MLX_PORT
};
