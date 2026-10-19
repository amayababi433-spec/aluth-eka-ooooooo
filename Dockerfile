FROM node:20-bookworm-slim

# Install system dependencies: ffmpeg, python3, git, curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    git \
    python3 \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency definitions and install dependencies
COPY package*.json ./
RUN npm install

# Copy application source code
COPY . .

ENV PORT=10000
EXPOSE 10000

CMD ["node", "index.js"]
