FROM node:20-slim

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Generate Prisma client for the container's OS
RUN npx prisma generate

EXPOSE 4000

CMD ["sh", "start.sh"]
