#!/bin/sh
set -e

# Ensure the SQLite database directory exists on the mounted disk
mkdir -p /data/prisma

# Run Prisma migrations
npx prisma migrate deploy

# Start the Node.js backend
exec node index.js
