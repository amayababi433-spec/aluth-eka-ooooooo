FROM mcr.microsoft.com/playwright/python:v1.47.0-jammy

WORKDIR /app

# Install FFmpeg for real-time MP3 streaming
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all application files explicitly
COPY app.py cookies.txt ./
COPY . .

ENV PORT=8080
ENV PYTHONPATH=/app
EXPOSE 8080

CMD ["uvicorn", "app:app", "--app-dir", "/app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]

