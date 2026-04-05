export const llamaParseService = {
    async parseFile(file) {
        const apiKey = import.meta.env.VITE_LLAMAPARSE_API_KEY;
        if (!apiKey) {
            throw new Error("VITE_LLAMAPARSE_API_KEY is not defined in .env");
        }

        const formData = new FormData();
        formData.append("file", file);

        try {
            // 1. Upload the file
            const uploadRes = await fetch('/api/llamaparse/upload', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: formData
            });

            if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.statusText}`);
            const uploadData = await uploadRes.json();
            const jobId = uploadData.id;

            // 2. Poll for completion
            let status = 'PENDING';
            while (status === 'PENDING') {
                await new Promise(resolve => setTimeout(resolve, 2000)); // wait 2s
                const statusRes = await fetch(`/api/llamaparse/job/${jobId}`, {
                    headers: {
                        'accept': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    }
                });
                if (!statusRes.ok) throw new Error(`Status check failed: ${statusRes.statusText}`);
                const statusData = await statusRes.json();
                status = statusData.status;

                if (status === 'ERROR') {
                    throw new Error("LlamaParse parsing error.");
                }
            }

            // 3. Fetch markdown result
            const resultRes = await fetch(`/api/llamaparse/job/${jobId}/result/markdown`, {
                headers: {
                    'accept': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                }
            });

            if (!resultRes.ok) throw new Error(`Failed to fetch parsed markdown: ${resultRes.statusText}`);
            const resultData = await resultRes.json();
            
            return resultData.markdown;
        } catch (error) {
            console.error("LlamaParse Service Error:", error);
            throw error;
        }
    }
};
