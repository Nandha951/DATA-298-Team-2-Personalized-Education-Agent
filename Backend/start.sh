#!/bin/sh
set -e

# Ensure SQLite database directory exists on the mounted disk
mkdir -p /data/prisma

# Run Prisma migrations
npx prisma migrate deploy

# Start ChromaDB server in the background on port 8000
chroma run --host 0.0.0.0 --port 8000 --path /data/chromadb &

# Start the Node.js backend
exec node index.js
