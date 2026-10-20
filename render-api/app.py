import os, re, json, asyncio, urllib.parse
from contextlib import asynccontextmanager
from fastapi import FastAPI, Query, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import httpx
import yt_dlp
from playwright.async_api import async_playwright

PORT = int(os.environ.get("PORT", 8080))
YT_COOKIES_PATH = os.path.join(os.path.dirname(__file__), "cookies.txt")

BLOCKED_TYPES = ["image", "font", "stylesheet"]
BLOCKED_DOMAINS = [
    "doubleclick.net", "googlesyndication.com", "google-analytics.com",
    "googletagmanager.com", "facebook.net", "adservice.google.com"
]
CHROMIUM_ARGS = [
    "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--disable-setuid-sandbox", "--disable-background-networking", "--disable-extensions",
    "--disable-sync", "--mute-audio", "--hide-scrollbars", "--no-first-run",
    "--disable-background-timer-throttling", "--disable-default-apps", "--disable-hang-monitor"
]

async def keep_alive_task():
    """Keeps Render container 100% active, preventing idle sleep (cold start bypass)."""
    await asyncio.sleep(30)
    while True:
        try:
            target_url = os.environ.get("RENDER_EXTERNAL_URL", "https://dmc-downloader-api.onrender.com")
            async with httpx.AsyncClient(timeout=15) as client:
                await client.get(f"{target_url}/health")
        except Exception:
            pass
        await asyncio.sleep(540)  # Ping every 9 minutes

@asynccontextmanager
async def lifespan(application):
    print("👑 DMC Downloader API 2.0 (Playwright + Native yt-dlp) starting...")
    # Start Keep-Alive Background Worker
    asyncio.create_task(keep_alive_task())
    yield
    print("DMC Downloader API shutting down.")

app = FastAPI(title="DMC Downloader API", version="2.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

async def get_browser():
    pw = await async_playwright().start()
    br = await pw.chromium.launch(headless=True, args=CHROMIUM_ARGS)
    return pw, br

async def block_resources(page):
    async def handler(route):
        if route.request.resource_type in BLOCKED_TYPES or any(d in route.request.url for d in BLOCKED_DOMAINS):
            await route.abort()
        else:
            await route.continue_()
    await page.route("**/*", handler)

# ════════════════════════════════════════════════════════════════
# 1. YOUTUBE ENGINES (Native In-Memory yt-dlp + Embed Playwright)
# ════════════════════════════════════════════════════════════════

def run_ytdlp_sync(url: str, media_type: str = "video"):
    """Engine A: Native In-Memory yt-dlp (Ultra Fast 1-2s Response)"""
    fmt = (
        "bestaudio[ext=m4a]/bestaudio/best"
        if media_type == "audio"
        else "18/bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
    )
    ydl_opts = {
        'format': fmt,
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'nocheckcertificate': True,
        'geo_bypass': True,
        'noplaylist': True,
    }
    if os.path.exists(YT_COOKIES_PATH):
        ydl_opts['cookiefile'] = YT_COOKIES_PATH

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        dl_url = info.get("url")
        if not dl_url and info.get("formats"):
            # Find progressive format or best format
            best = next((f for f in info['formats'] if f.get('acodec') != 'none' and f.get('vcodec') != 'none'), None)
            if best:
                dl_url = best.get('url')
            if not dl_url:
                dl_url = info['formats'][-1].get('url')

        if not dl_url:
            raise Exception("No direct stream URL returned by yt-dlp")

        return {
            "title": info.get("title", "YouTube Media"),
            "download_url": dl_url,
            "duration": info.get("duration", 0),
            "thumbnail": info.get("thumbnail")
        }

async def scrape_youtube_playwright(url: str, media_type: str = "video"):
    """Engine B: Playwright Embed Stream Interceptor (100% Captcha/Consent Bypass)"""
    pw, br = await get_browser()
    ctx = pg = None
    captured_urls = []
    try:
        ctx = await br.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 720}
        )
        pg = await ctx.new_page()

        async def on_req(request):
            req_url = request.url
            if "googlevideo.com/videoplayback" in req_url:
                if ("mime=video" in req_url or "mime=audio" in req_url) and req_url not in captured_urls:
                    captured_urls.append(req_url)

        pg.on("request", on_req)

        # Use YouTube Embed mode to bypass cookie consent dialogs completely
        vid_match = re.search(r"(?:v=|/shorts/|youtu\.be/)([a-zA-Z0-9_-]{11})", url)
        if vid_match:
            nav_url = f"https://www.youtube.com/embed/{vid_match.group(1)}?autoplay=1"
        else:
            nav_url = url

        await pg.goto(nav_url, wait_until="domcontentloaded", timeout=25000)

        # Click play button if needed
        try:
            btn = await pg.query_selector("button.ytp-large-play-button, button.ytp-play-button, video")
            if btn:
                await btn.click()
        except Exception:
            pass

        # Wait up to 6 seconds for videoplayback network request
        for _ in range(6):
            if captured_urls:
                break
            await asyncio.sleep(1)

        title = "YouTube Media"
        try:
            t = await pg.title()
            title = re.sub(r"\s*-\s*YouTube$", "", t, flags=re.IGNORECASE).strip() or "YouTube Media"
        except Exception:
            pass

        if not captured_urls:
            raise Exception("Playwright could not capture videoplayback stream")

        chosen = captured_urls[0]
        for u in captured_urls:
            if media_type == "audio" and "mime=audio" in u:
                chosen = u
                break
            elif media_type == "video" and "mime=video" in u:
                chosen = u
                break

        return {
            "title": title,
            "download_url": chosen,
            "duration": 0,
            "thumbnail": None
        }
    finally:
        try:
            if pg: await pg.close()
            if ctx: await ctx.close()
            await br.close()
            await pw.stop()
        except Exception:
            pass

# ════════════════════════════════════════════════════════════════
# 2. ROUTES
# ════════════════════════════════════════════════════════════════

@app.get("/health")
async def health():
    return {
        "status": "online",
        "engine": "DMC Downloader API v2.0 (Playwright + yt-dlp Native)",
        "platform": "Render.com Always-On Container",
        "cookies_loaded": os.path.exists(YT_COOKIES_PATH)
    }

@app.get("/api/info")
async def youtube_info(request: Request, url: str = Query(...), type: str = Query("video")):
    media_type = "audio" if type.lower() in ["audio", "mp3", "yta", "ytaudio"] else "video"
    
    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme or "https"
    base_url = f"{proto}://{host}"

    data = None
    ytdlp_error = None

    # Step 1: Run Native In-Memory yt-dlp first (fastest)
    try:
        data = await asyncio.to_thread(run_ytdlp_sync, url, media_type)
    except Exception as e:
        ytdlp_error = str(e)
        print(f"yt-dlp error: {e}. Switching to Playwright Embed Interceptor...")

    # Step 2: Fallback to Playwright Embed Stream Interceptor
    if not data or not data.get("download_url"):
        try:
            data = await scrape_youtube_playwright(url, media_type)
        except Exception as pw_err:
            return JSONResponse({
                "error": f"Extraction failed: {pw_err} (yt-dlp: {ytdlp_error})"
            }, status_code=500)

    raw_stream = data.get("download_url")
    if not raw_stream:
        return JSONResponse({"error": "No stream URL found"}, status_code=500)

    # Wrap in high-speed /stream proxy so it bypasses Google Video IP-lock
    encoded_stream = urllib.parse.quote(raw_stream, safe="")
    proxy_download_url = f"{base_url}/stream?url={encoded_stream}&type={media_type}"

    return JSONResponse({
        "title": data.get("title", "YouTube Media"),
        "duration": data.get("duration", 0),
        "download_url": proxy_download_url
    })

@app.get("/stream")
async def stream_proxy(url: str = Query(...), type: str = Query("video")):
    if not url:
        raise HTTPException(status_code=400, detail="No URL provided")
    
    media_type = "audio" if type.lower() in ["audio", "mp3", "yta"] else "video"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "*/*"
    }

    client = httpx.AsyncClient(timeout=180, follow_redirects=True)
    try:
        req = client.build_request("GET", url, headers=headers)
        upstream_resp = await client.send(req, stream=True)
        if upstream_resp.status_code >= 400:
            await upstream_resp.aclose()
            await client.aclose()
            raise HTTPException(status_code=upstream_resp.status_code, detail=f"Source returned {upstream_resp.status_code}")

        if media_type == "audio":
            # Real-time FFmpeg pipe: Progressive stream -> MP3 192k
            async def ffmpeg_audio_stream():
                proc = await asyncio.create_subprocess_exec(
                    "ffmpeg", "-i", "pipe:0", "-vn", "-acodec", "libmp3lame",
                    "-b:a", "192k", "-f", "mp3", "pipe:1",
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.DEVNULL
                )
                async def pipe_in():
                    try:
                        async for chunk in upstream_resp.aiter_bytes(262144):
                            proc.stdin.write(chunk)
                            await proc.stdin.drain()
                    except Exception:
                        pass
                    finally:
                        try:
                            proc.stdin.close()
                            await proc.stdin.wait_closed()
                        except Exception:
                            pass

                asyncio.create_task(pipe_in())
                try:
                    while True:
                        buf = await proc.stdout.read(65536)
                        if not buf:
                            break
                        yield buf
                finally:
                    try:
                        proc.kill()
                    except Exception:
                        pass
                    await upstream_resp.aclose()
                    await client.aclose()

            return StreamingResponse(ffmpeg_audio_stream(), media_type="audio/mpeg")
        else:
            # 100% Speed direct video pipe with 256KB buffer
            async def video_stream():
                try:
                    async for chunk in upstream_resp.aiter_bytes(262144):
                        yield chunk
                finally:
                    await upstream_resp.aclose()
                    await client.aclose()

            resp_headers = {}
            cl = upstream_resp.headers.get("content-length")
            if cl:
                resp_headers["Content-Length"] = cl

            return StreamingResponse(video_stream(), media_type="video/mp4", headers=resp_headers)

    except Exception as e:
        await client.aclose()
        raise HTTPException(status_code=500, detail=str(e))

# ════════════════════════════════════════════════════════════════
# 3. TERABOX ENGINE
# ════════════════════════════════════════════════════════════════

async def scrape_terabox(url):
    pw, br = await get_browser()
    ctx = pg = None
    try:
        ctx = await br.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 720}
        )
        pg = await ctx.new_page()
        await block_resources(pg)
        vurls = []

        async def on_tb_resp(r):
            u = r.url.lower()
            ct = (r.headers.get("content-type") or "").lower()
            if (any(e in u for e in [".mp4", ".m3u8", ".mkv", ".webm"]) or "video" in ct or "dlink" in u) and r.status < 400:
                vurls.append(r.url)

        pg.on("response", on_tb_resp)
        await pg.goto(url, wait_until="domcontentloaded", timeout=30000)
        await asyncio.sleep(4)

        try:
            btn = await pg.query_selector("button[class*='play'], .play-btn, [aria-label*='play' i]")
            if btn:
                await btn.click()
                await asyncio.sleep(2)
        except Exception:
            pass

        try:
            js = await pg.evaluate("() => [window.__dlink, window.dlink, window.videoUrl, window.video_url].filter(Boolean)[0] || null")
            if js and str(js).startswith("http"):
                vurls.insert(0, js)
        except Exception:
            pass

        title = "TeraBox Video"
        try:
            t = await pg.title()
            title = re.sub(r"\s*[-|]\s*TeraBox.*$", "", t, flags=re.IGNORECASE).strip() or "TeraBox Video"
        except Exception:
            pass

        if not vurls:
            return {"success": False, "error": "No direct video stream found."}

        fu = next((v for v in vurls if ".mp4" in v.lower()), vurls[0])
        return {"success": True, "title": title, "download_url": fu}
    except Exception as e:
        return {"success": False, "error": f"TeraBox extraction failed: {str(e)[:200]}"}
    finally:
        try:
            if pg: await pg.close()
            if ctx: await ctx.close()
            await br.close()
            await pw.stop()
        except Exception:
            pass

@app.get("/api/terabox")
async def terabox_info(request: Request, url: str = Query(...)):
    data = await scrape_terabox(url)
    if not data.get("success"):
        return JSONResponse(data, status_code=500)
    
    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme or "https"
    base_url = f"{proto}://{host}"
    
    proxy_url = f"{base_url}/terabox-stream?url={urllib.parse.quote(data['download_url'], safe='')}"
    return JSONResponse({
        "success": True,
        "title": data.get("title", "TeraBox Video"),
        "download_url": proxy_url
    })

@app.get("/terabox-stream")
async def terabox_stream(url: str = Query(...)):
    client = httpx.AsyncClient(timeout=180, follow_redirects=True)
    try:
        req = client.build_request("GET", url, headers={"User-Agent": "Mozilla/5.0"})
        r = await client.send(req, stream=True)
        async def tb_stream():
            try:
                async for chunk in r.aiter_bytes(262144):
                    yield chunk
            finally:
                await r.aclose()
                await client.aclose()
        return StreamingResponse(tb_stream(), media_type="video/mp4")
    except Exception as e:
        await client.aclose()
        raise HTTPException(status_code=500, detail=str(e))

# ════════════════════════════════════════════════════════════════
# 4. DISKWALA ENGINE
# ════════════════════════════════════════════════════════════════

async def scrape_diskwala(url):
    pw, br = await get_browser()
    ctx = pg = None
    try:
        ctx = await br.new_context(
            user_agent="Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 Chrome/120.0.6099.210 Mobile Safari/537.36",
            viewport={"width": 412, "height": 915}
        )
        pg = await ctx.new_page()
        await block_resources(pg)
        vurls = []

        async def on_dw_resp(r):
            u = r.url.lower()
            ct = (r.headers.get("content-type") or "").lower()
            if (any(e in u for e in [".mp4", ".m3u8", ".webm"]) or "video" in ct or "stream" in u) and r.status < 400 and "diskwala.com" not in u:
                vurls.append(r.url)

        pg.on("response", on_dw_resp)
        await pg.goto(url, wait_until="domcontentloaded", timeout=35000)
        await asyncio.sleep(3)

        try:
            for sel in ["button[class*='play']", ".video-play-button", "video"]:
                btn = await pg.query_selector(sel)
                if btn:
                    await btn.click()
                    await asyncio.sleep(2)
                    break
        except Exception:
            pass

        title = "DiskWala Video"
        try:
            t = await pg.title()
            title = re.sub(r"\s*[-|]\s*(?:DiskWala|Disk Wala).*$", "", t, flags=re.IGNORECASE).strip() or "DiskWala Video"
        except Exception:
            pass

        if not vurls:
            return {"success": False, "error": "No video stream found."}

        fu = next((v for v in vurls if ".mp4" in v.lower()), vurls[0])
        return {"success": True, "title": title, "download_url": fu}
    except Exception as e:
        return {"success": False, "error": f"DiskWala extraction failed: {str(e)[:200]}"}
    finally:
        try:
            if pg: await pg.close()
            if ctx: await ctx.close()
            await br.close()
            await pw.stop()
        except Exception:
            pass

@app.get("/api/diskwala")
async def diskwala_info(request: Request, url: str = Query(...)):
    data = await scrape_diskwala(url)
    if not data.get("success"):
        return JSONResponse(data, status_code=500)
    
    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme or "https"
    base_url = f"{proto}://{host}"
    
    proxy_url = f"{base_url}/diskwala-stream?url={urllib.parse.quote(data['download_url'], safe='')}"
    return JSONResponse({
        "success": True,
        "title": data.get("title", "DiskWala Video"),
        "download_url": proxy_url
    })

@app.get("/diskwala-stream")
async def diskwala_stream(url: str = Query(...)):
    client = httpx.AsyncClient(timeout=180, follow_redirects=True)
    try:
        req = client.build_request("GET", url, headers={"User-Agent": "Mozilla/5.0"})
        r = await client.send(req, stream=True)
        async def dw_stream():
            try:
                async for chunk in r.aiter_bytes(262144):
                    yield chunk
            finally:
                await r.aclose()
                await client.aclose()
        return StreamingResponse(dw_stream(), media_type="video/mp4")
    except Exception as e:
        await client.aclose()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=PORT, reload=False, workers=1)
