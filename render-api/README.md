# DMC Downloader API
Render.com Optimized YouTube + TeraBox + DiskWala Downloader API Engine.

## Endpoints
- `GET /health`
- `GET /api/info?url=URL&type=video|audio` - YouTube stream URL
- `GET /stream?url=URL&type=video|audio` - YouTube stream proxy
- `GET /api/terabox?url=URL` - TeraBox direct link
- `GET /terabox-stream?url=URL` - TeraBox stream proxy
- `GET /api/diskwala?url=URL` - DiskWala direct link
- `GET /diskwala-stream?url=URL` - DiskWala stream proxy

## Deploy to Render.com
1. Push this folder to GitHub
2. Go to dashboard.render.com -> New -> Web Service
3. Connect GitHub repo
4. Runtime: Docker
5. Deploy!

## RAM Optimizations (512MB Render Free Tier)
- Single-process Chromium
- Image/CSS/Font/Ad blocking
- yt-dlp JSON-only mode (no download)
- Max 720p YouTube (saves RAM)
