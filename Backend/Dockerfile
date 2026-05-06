FROM node:20-slim

# Install Python + pip for ChromaDB server
RUN apt-get update && apt-get install -y python3 python3-pip curl && rm -rf /var/lib/apt/lists/*
RUN pip3 install chromadb --break-system-packages

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Generate Prisma client
RUN npx prisma generate

EXPOSE 4000

CMD ["sh", "start.sh"]
