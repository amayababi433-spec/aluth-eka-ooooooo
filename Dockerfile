FROM node:20-bookworm-slim

# Install system dependencies: ffmpeg, python3, git, curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    git \
    python3 \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set up user with UID 1000 required by Hugging Face Spaces
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PORT=7860 \
    NODE_ENV=production

WORKDIR $HOME/app

# Copy dependency definitions and install
COPY --chown=user package*.json ./
RUN npm install --production

# Copy application source code
COPY --chown=user . .

EXPOSE 7860

CMD ["node", "index.js"]
