#!/bin/sh
set -e

# Run Prisma migrations on startup
npx prisma migrate deploy

# Start ChromaDB server in the background on port 8000
chromadb run --host 0.0.0.0 --port 8000 --path /data/chromadb &

# Wait for ChromaDB to be ready
echo "Waiting for ChromaDB..."
until curl -sf http://localhost:8000/api/v1/heartbeat > /dev/null 2>&1; do
  sleep 1
done
echo "ChromaDB ready."

# Start the Node.js backend
exec node index.js
