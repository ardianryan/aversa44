import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_MP4 = path.join(ROOT, 'cloud-stream', 'fallback-loop.mp4');
const PREVIEW_PNG = path.join(ROOT, 'cloud-stream', 'fallback-preview.png');

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const DURATION_SEC = 12;
const TOTAL_FRAMES = FPS * DURATION_SEC;

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const HTML = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    overflow: hidden;
    background: #1A021D;
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #FFF5D6;
  }
  .stage {
    position: relative;
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    overflow: hidden;
    background: radial-gradient(ellipse at 50% 45%, #360538 0%, #1A021D 68%, #0D010F 100%);
  }
  .bg-image {
    position: absolute;
    inset: -60px;
    width: calc(100% + 120px);
    height: calc(100% + 120px);
    object-fit: cover;
    opacity: 0.72;
    transform-origin: center;
    will-change: transform;
  }
  .vignette {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 50% 48%, rgba(26, 2, 29, 0.05) 0%, rgba(26, 2, 29, 0.45) 58%, rgba(13, 1, 15, 0.88) 100%);
  }
  #fx-canvas {
    position: absolute;
    inset: 0;
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
  }
  .frame-border {
    position: absolute;
    inset: 38px;
    border: 1.5px solid rgba(245, 197, 56, 0.34);
    border-radius: 24px;
    pointer-events: none;
  }
  .corner {
    position: absolute;
    width: 112px;
    height: 112px;
    opacity: 0.82;
    filter: drop-shadow(0 0 18px rgba(245, 197, 56, 0.35));
  }
  .corner.tl { top: 26px; left: 26px; }
  .corner.tr { top: 26px; right: 26px; transform: scaleX(-1); }
  .corner.bl { bottom: 26px; left: 26px; transform: scaleY(-1); }
  .corner.br { bottom: 26px; right: 26px; transform: scale(-1); }

  .center-stack {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 28px;
    z-index: 5;
  }
  .crest-badge {
    display: inline-flex;
    align-items: center;
    gap: 14px;
    padding: 10px 26px;
    border-radius: 999px;
    border: 1px solid rgba(245, 197, 56, 0.45);
    background: rgba(24, 2, 27, 0.72);
    box-shadow: 0 12px 36px rgba(13, 1, 15, 0.55);
  }
  .crest-badge img {
    width: 34px;
    height: 38px;
    object-fit: contain;
  }
  .crest-badge span {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #FDF39D;
  }

  .logo-wrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 680px;
    height: 460px;
  }
  .logo-aura {
    position: absolute;
    width: 560px;
    height: 560px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(245, 197, 56, 0.28) 0%, rgba(224, 157, 23, 0.1) 42%, rgba(54, 5, 56, 0) 72%);
    filter: blur(18px);
    transform-origin: center;
  }
  .logo-img {
    position: relative;
    width: 560px;
    max-height: 440px;
    object-fit: contain;
    filter: drop-shadow(0 18px 42px rgba(13, 1, 15, 0.75)) drop-shadow(0 0 28px rgba(245, 197, 56, 0.22));
    transform-origin: center;
  }
  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 16px;
    padding: 16px 36px;
    border-radius: 999px;
    border: 1.5px solid rgba(245, 197, 56, 0.52);
    background: linear-gradient(135deg, rgba(38, 4, 42, 0.88), rgba(24, 2, 27, 0.92));
    box-shadow: 0 18px 44px rgba(13, 1, 15, 0.65), inset 0 1px 0 rgba(253, 243, 157, 0.25);
  }
  .status-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #F5C538;
    box-shadow: 0 0 16px #F5C538, 0 0 32px rgba(245, 197, 56, 0.6);
  }
  .status-text {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #FFF5D6;
  }
  .status-sep {
    color: #F5C538;
    opacity: 0.85;
  }
</style>
</head>
<body>
  <div class="stage">
    <img class="bg-image" id="bg" src="/bg.png" alt="" />
    <div class="vignette"></div>
    <canvas id="fx-canvas" width="${WIDTH}" height="${HEIGHT}"></canvas>
    <div class="frame-border"></div>
    <img class="corner tl" src="/filigree.svg" alt="" />
    <img class="corner tr" src="/filigree.svg" alt="" />
    <img class="corner bl" src="/filigree.svg" alt="" />
    <img class="corner br" src="/filigree.svg" alt="" />

    <div class="center-stack">
      <div class="crest-badge" id="badge">
        <img src="/crest.png" alt="" />
        <span>SMA Negeri 1 Gedeg &bull; Dies Natalis ke-44</span>
      </div>
      <div class="logo-wrap">
        <div class="logo-aura" id="aura"></div>
        <img class="logo-img" id="logo" src="/logo.png" alt="AVERSA 44" />
      </div>
      <div class="status-pill" id="pill">
        <span class="status-dot" id="dot"></span>
        <span class="status-text">Siaran Langsung <span class="status-sep">&bull;</span> Mohon Menunggu Sesaat</span>
      </div>
    </div>
  </div>

<script src="/anime.umd.min.js"></script>
<script>
  const TOTAL_MS = ${DURATION_SEC * 1000};
  const canvas = document.getElementById('fx-canvas');
  const ctx = canvas.getContext('2d');

  // Anime.js v4 deterministic looping timeline (seamless start == end)
  const tl = anime.createTimeline({ autoplay: false, loop: false });
  tl.add('#logo', {
    translateY: [
      { to: -14, duration: TOTAL_MS / 2, ease: 'inOutSine' },
      { to: 0, duration: TOTAL_MS / 2, ease: 'inOutSine' },
    ],
    scale: [
      { to: 1.032, duration: TOTAL_MS / 2, ease: 'inOutSine' },
      { to: 1, duration: TOTAL_MS / 2, ease: 'inOutSine' },
    ],
  }, 0);

  tl.add('#aura', {
    scale: [
      { to: 1.18, duration: TOTAL_MS / 2, ease: 'inOutSine' },
      { to: 1, duration: TOTAL_MS / 2, ease: 'inOutSine' },
    ],
    opacity: [
      { to: 0.95, duration: TOTAL_MS / 2, ease: 'inOutSine' },
      { to: 0.58, duration: TOTAL_MS / 2, ease: 'inOutSine' },
    ],
  }, 0);

  tl.add('#bg', {
    scale: [
      { to: 1.045, duration: TOTAL_MS / 2, ease: 'inOutSine' },
      { to: 1, duration: TOTAL_MS / 2, ease: 'inOutSine' },
    ],
  }, 0);

  tl.add('#dot', {
    scale: [
      { to: 1.32, duration: TOTAL_MS / 6, ease: 'inOutSine' },
      { to: 0.82, duration: TOTAL_MS / 6, ease: 'inOutSine' },
      { to: 1.32, duration: TOTAL_MS / 6, ease: 'inOutSine' },
      { to: 0.82, duration: TOTAL_MS / 6, ease: 'inOutSine' },
      { to: 1.32, duration: TOTAL_MS / 6, ease: 'inOutSine' },
      { to: 1, duration: TOTAL_MS / 6, ease: 'inOutSine' },
    ],
    opacity: [
      { to: 1, duration: TOTAL_MS / 6, ease: 'inOutSine' },
      { to: 0.4, duration: TOTAL_MS / 6, ease: 'inOutSine' },
      { to: 1, duration: TOTAL_MS / 6, ease: 'inOutSine' },
      { to: 0.4, duration: TOTAL_MS / 6, ease: 'inOutSine' },
      { to: 1, duration: TOTAL_MS / 6, ease: 'inOutSine' },
      { to: 1, duration: TOTAL_MS / 6, ease: 'inOutSine' },
    ],
  }, 0);

  tl.add('#pill', {
    translateY: [
      { to: -5, duration: TOTAL_MS / 2, ease: 'inOutSine' },
      { to: 0, duration: TOTAL_MS / 2, ease: 'inOutSine' },
    ],
  }, 0);

  // Deterministic PRNG for ReactBits-style stardust sparkles & aurora ribbons
  function mulberry32(seed) {
    return function() {
      let t = (seed += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(442026);
  const particles = Array.from({ length: 110 }, (_, idx) => {
    const angle = rand() * Math.PI * 2;
    const radiusX = 240 + rand() * 720;
    const radiusY = 140 + rand() * 400;
    const colorChoices = ['#F5C538', '#FDF39D', '#F7D160', '#FFF5D6', '#F5B8CB'];
    return {
      cx: ${WIDTH} / 2 + Math.cos(angle) * radiusX,
      cy: ${HEIGHT} / 2 + Math.sin(angle) * radiusY,
      ampX: 16 + rand() * 38,
      ampY: 14 + rand() * 34,
      phase: rand() * Math.PI * 2,
      freq: 1 + Math.floor(rand() * 2),
      twinkleFreq: 1 + Math.floor(rand() * 3),
      size: 1.8 + rand() * 4.2,
      isStar: idx % 5 === 0,
      color: colorChoices[Math.floor(rand() * colorChoices.length)],
    };
  });

  function drawStar(x, y, r, alpha, color) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = r * 4;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      ctx.lineTo(x + Math.cos(a) * r * 2.4, y + Math.sin(a) * r * 2.4);
      ctx.lineTo(x + Math.cos(a + Math.PI / 4) * r * 0.55, y + Math.sin(a + Math.PI / 4) * r * 0.55);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function renderCanvas(progress) {
    const tau = Math.PI * 2;
    const theta = progress * tau;
    ctx.clearRect(0, 0, ${WIDTH}, ${HEIGHT});

    // 1. Soft moving Aurora / Spotlight beams
    const beam1X = ${WIDTH} * (0.28 + 0.14 * Math.sin(theta));
    const beam1Y = ${HEIGHT} * (0.34 + 0.08 * Math.cos(theta));
    const g1 = ctx.createRadialGradient(beam1X, beam1Y, 20, beam1X, beam1Y, 540);
    g1.addColorStop(0, 'rgba(245, 197, 56, 0.16)');
    g1.addColorStop(0.5, 'rgba(224, 157, 23, 0.05)');
    g1.addColorStop(1, 'rgba(26, 2, 29, 0)');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, ${WIDTH}, ${HEIGHT});

    const beam2X = ${WIDTH} * (0.72 + 0.14 * Math.cos(theta));
    const beam2Y = ${HEIGHT} * (0.62 + 0.09 * Math.sin(theta));
    const g2 = ctx.createRadialGradient(beam2X, beam2Y, 20, beam2X, beam2Y, 580);
    g2.addColorStop(0, 'rgba(245, 184, 203, 0.12)');
    g2.addColorStop(0.5, 'rgba(125, 27, 5, 0.06)');
    g2.addColorStop(1, 'rgba(26, 2, 29, 0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, ${WIDTH}, ${HEIGHT});

    // 2. Concentric rotating Royal Gold orbital rings around center
    ctx.save();
    ctx.translate(${WIDTH} / 2, ${HEIGHT} / 2 - 10);

    // Outer dashed ring (2 full turns per cycle or symmetric dash rotation)
    ctx.save();
    ctx.rotate(theta);
    ctx.strokeStyle = 'rgba(245, 197, 56, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([12, 18]);
    ctx.beginPath();
    ctx.arc(0, 0, 355, 0, tau);
    ctx.stroke();
    ctx.restore();

    // Inner glowing arc sweep
    ctx.save();
    ctx.rotate(-theta);
    const arcGrad = ctx.createLinearGradient(-300, -300, 300, 300);
    arcGrad.addColorStop(0, 'rgba(253, 243, 157, 0.55)');
    arcGrad.addColorStop(0.45, 'rgba(245, 197, 56, 0.08)');
    arcGrad.addColorStop(1, 'rgba(245, 197, 56, 0)');
    ctx.strokeStyle = arcGrad;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 310, 0, Math.PI * 1.15);
    ctx.stroke();
    ctx.restore();

    // Second counter-rotating subtle arc
    ctx.save();
    ctx.rotate(theta + Math.PI);
    ctx.strokeStyle = 'rgba(247, 209, 96, 0.24)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 395, 0, Math.PI * 0.7);
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    // 3. Stardust particles & twinkling 4-point royal stars
    for (const p of particles) {
      const x = p.cx + Math.sin(theta * p.freq + p.phase) * p.ampX;
      const y = p.cy + Math.cos(theta * p.freq + p.phase * 1.3) * p.ampY;
      const alpha = 0.22 + 0.72 * (0.5 + 0.5 * Math.sin(theta * p.twinkleFreq + p.phase));
      if (p.isStar) {
        drawStar(x, y, p.size, alpha, p.color);
      } else {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = p.size * 3;
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, tau);
        ctx.fill();
        ctx.restore();
      }
    }

    // 4. Subtle diagonal royal gold sheen sweep across the canvas
    const sweepPos = ((progress * 2) % 1) * (${WIDTH} + 900) - 450;
    const sweepAlpha = Math.sin(((progress * 2) % 1) * Math.PI) * 0.09;
    if (sweepAlpha > 0.002) {
      ctx.save();
      ctx.translate(sweepPos, 0);
      ctx.transform(1, 0, -0.35, 1, 0, 0);
      const sg = ctx.createLinearGradient(-160, 0, 160, 0);
      sg.addColorStop(0, 'rgba(253, 243, 157, 0)');
      sg.addColorStop(0.5, 'rgba(253, 243, 157, ' + sweepAlpha.toFixed(4) + ')');
      sg.addColorStop(1, 'rgba(253, 243, 157, 0)');
      ctx.fillStyle = sg;
      ctx.fillRect(-160, 0, 320, ${HEIGHT});
      ctx.restore();
    }
  }

  window.__renderFrame = (frameIndex) => {
    const progress = frameIndex / ${TOTAL_FRAMES};
    tl.seek(progress * TOTAL_MS);
    renderCanvas(progress);
    return true;
  };
  window.__renderFrame(0);
</script>
</body>
</html>`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const ROUTES = {
  '/anime.umd.min.js': path.join(ROOT, 'node_modules/animejs/dist/bundles/anime.umd.min.js'),
  '/bg.png': path.join(ROOT, 'public/assets/backgrounds/bg-imperial-velvet-stardust.png'),
  '/logo.png': path.join(ROOT, 'public/assets/png/aversa-brand-combination.png'),
  '/crest.png': path.join(ROOT, 'public/assets/extracted/logo-sman1gedeg.png'),
  '/filigree.svg': path.join(ROOT, 'public/assets/brandkit/item-ornate-corner-filigree.svg'),
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/' || req.url === '/index.html') {
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(HTML);
        return;
      }
      const file = ROUTES[req.url];
      if (file && fs.existsSync(file)) {
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
        return;
      }
      res.writeHead(404);
      res.end('Not found');
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

async function waitForCdp(port) {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Timed out waiting for Chrome CDP');
}

function createCdpClient(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();
    ws.addEventListener('open', () => {
      resolve({
        send(method, params = {}) {
          const id = nextId++;
          return new Promise((res, rej) => {
            pending.set(id, { res, rej });
            ws.send(JSON.stringify({ id, method, params }));
          });
        },
        close() {
          ws.close();
        },
      });
    });
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data.toString());
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      }
    });
    ws.addEventListener('error', reject);
  });
}

async function main() {
  const { server, port } = await startServer();
  const cdpPort = 9333 + Math.floor(Math.random() * 500);
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    `--window-size=${WIDTH},${HEIGHT}`,
    `--remote-debugging-port=${cdpPort}`,
    `http://127.0.0.1:${port}/`,
  ], { stdio: 'ignore' });

  const ffmpeg = spawn('ffmpeg', [
    '-hide_banner', '-loglevel', 'warning', '-y',
    '-f', 'image2pipe', '-vcodec', 'mjpeg', '-framerate', String(FPS), '-i', 'pipe:0',
    '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
    '-t', String(DURATION_SEC),
    '-vf', `scale=${WIDTH}:${HEIGHT},setsar=1,setdar=16/9,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-g', String(FPS * 2), '-bf', '0',
    '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '128k',
    '-movflags', '+faststart',
    OUT_MP4,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });

  let cdp;
  try {
    const wsUrl = await waitForCdp(cdpPort);
    cdp = await createCdpClient(wsUrl);
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send('Runtime.evaluate', {
      expression: 'Promise.all(Array.from(document.images).map(i => i.complete ? Promise.resolve() : new Promise(r => { i.onload = r; i.onerror = r; })))',
      awaitPromise: true,
    });

    for (let i = 0; i < TOTAL_FRAMES; i++) {
      await cdp.send('Runtime.evaluate', { expression: `window.__renderFrame(${i})` });
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 94 });
      const buf = Buffer.from(data, 'base64');
      if (i === 90) {
        const pngShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(PREVIEW_PNG, Buffer.from(pngShot.data, 'base64'));
      }
      if (!ffmpeg.stdin.write(buf)) {
        await new Promise((r) => ffmpeg.stdin.once('drain', r));
      }
      if ((i + 1) % 60 === 0) console.log(`Rendered ${i + 1}/${TOTAL_FRAMES} frames...`);
    }
    ffmpeg.stdin.end();
    await new Promise((resolve, reject) => {
      ffmpeg.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
    });
    console.log(`Generated ${OUT_MP4} successfully.`);
  } finally {
    if (cdp) cdp.close();
    chrome.kill('SIGTERM');
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
