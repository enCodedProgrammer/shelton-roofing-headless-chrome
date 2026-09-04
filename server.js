// Shelton Roofing — postcard render service
// POST /render  { front_html, back_html }  ->  { front_png, back_png }  (base64)
//
// Contract matches the n8n node "Render Postcard PNGs" / "Capture Rendered Artwork".

const express = require('express');
const puppeteer = require('puppeteer');

const app = express();

// Postcard HTML embeds two full-resolution images as base64 data URIs, so the
// request body is large. Default Express limit (100kb) would reject it.
// Body carries two full-res base64 images. 32mb is enough and keeps peak
// memory lower than 64mb, which matters on a 512MB instance.
app.use(express.json({ limit: '32mb' }));

// On a 512MB instance a resident Chrome eats ~100MB doing nothing, and the
// service spins down when idle anyway. Launching per request and closing
// returns memory to the OS between renders.
const LOW_MEMORY = process.env.LOW_MEMORY !== 'false';

const WIDTH = 2775;   // 6x9 landscape @300dpi incl. 0.125" bleed
const HEIGHT = 1875;
const AUTH_TOKEN = process.env.RENDER_AUTH_TOKEN || '';

// The Puppeteer base image ships Chrome; its path is exposed as
// PUPPETEER_EXECUTABLE_PATH in that image. Fall back to puppeteer's own
// resolver if the env var is absent (e.g. running locally).
const EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',   // /dev/shm is tiny in containers; Chrome crashes without this
  '--disable-gpu',
  '--single-process',          // one process instead of several: big saving on 512MB
  '--no-zygote',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-features=site-per-process',
  '--js-flags=--max-old-space-size=256',
];

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({ headless: 'new', args: LAUNCH_ARGS, executablePath: EXECUTABLE_PATH });
  }
  return browserPromise;
}

async function renderPanel(html) {
  const browser = LOW_MEMORY
    ? await puppeteer.launch({ headless: 'new', args: LAUNCH_ARGS, executablePath: EXECUTABLE_PATH })
    : await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
    // Give embedded fonts a moment to settle before the screenshot.
    await page.evaluateHandle('document.fonts.ready');
    await new Promise(r => setTimeout(r, 500));
    return await page.screenshot({ type: 'png', encoding: 'base64' });
  } finally {
    await page.close();
    if (LOW_MEMORY) { await browser.close(); }  // release memory between panels
  }
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/render', async (req, res) => {
  if (AUTH_TOKEN && req.get('x-auth-token') !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { front_html, back_html } = req.body || {};
  if (!front_html || !back_html) {
    return res.status(400).json({ error: 'front_html and back_html are both required' });
  }

  try {
    // Sequential, not parallel: two 2775x1875 pages at once will OOM a small instance.
    const front_png = await renderPanel(front_html);
    const back_png = await renderPanel(back_html);
    res.json({ front_png, back_png, width: WIDTH, height: HEIGHT });
  } catch (err) {
    console.error('render failed:', err);
    // Drop the cached browser so the next request gets a clean one.
    browserPromise = null;
    res.status(500).json({ error: String(err && err.message || err) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`render service listening on ${port}`));
