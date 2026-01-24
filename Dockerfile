FROM node:18-alpine
# ⚡ Dockerfile Alpine Rocket (Snippet #6)
RUN apk add --no-cache tini curl ffmpeg python3 build-essential && rm -rf /var/cache/apk/*
WORKDIR /app
COPY package*.json ./
# Clean cache for smaller image
RUN npm ci --only=prod --no-optional && npm cache clean --force
COPY . .
# Create session directory
RUN mkdir -p auth_info_baileys && chmod 777 auth_info_baileys
EXPOSE 8000/tcp
# Use tini as entrypoint
ENTRYPOINT ["/sbin/tini", "--"]
# Run with memory limit optimization
CMD ["node", "--max-old-space-size=128", "--optimize-for-size", "index.js"]
