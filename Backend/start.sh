#!/bin/sh
set -e

# Ensure SQLite database directory exists on the mounted disk
mkdir -p /data/prisma

# Run Prisma migrations
npx prisma migrate deploy

# Start ChromaDB server in the background on port 8000
chroma run --host 0.0.0.0 --port 8000 --path /data/chromadb &

# Wait for ChromaDB to be ready before starting Node.js
echo "Waiting for ChromaDB..."
until curl -sf http://localhost:8000/api/v1/heartbeat > /dev/null 2>&1; do
  sleep 1
done
echo "ChromaDB ready."

# Start the Node.js backend
exec node index.js
