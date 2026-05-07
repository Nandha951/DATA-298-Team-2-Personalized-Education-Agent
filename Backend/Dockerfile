FROM node:20-slim

# Python + ChromaDB: required for the vector memory / RAG feature
RUN apt-get update && apt-get install -y python3 python3-pip curl openssl && rm -rf /var/lib/apt/lists/*
RUN pip3 install chromadb --break-system-packages

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Generate Prisma client for the container OS
RUN npx prisma generate

EXPOSE 4000

CMD ["sh", "start.sh"]
