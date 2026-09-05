// Shelton Roofing — postcard render service
// POST /render  { front_html, back_html }  ->  { front_png, back_png }  (base64)
// Contract matches the n8n nodes "Render Postcard PNGs" / "Capture Rendered Artwork".

const express = require('express');
const puppeteer = require('puppeteer');
const sharp = require('sharp');

const app = express();
app.use(express.json({ limit: '32mb' }));

// Launch per request and close, returning memory between renders. 512MB-friendly.
const LOW_MEMORY = process.env.LOW_MEMORY !== 'false';
// Optional explicit Chrome path; leave unset to use the image's auto-detected one.
const EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

const WIDTH = 2775;   // 6x9 landscape @300dpi incl. 0.125" bleed
const HEIGHT = 1875;
const AUTH_TOKEN = process.env.RENDER_AUTH_TOKEN || '';

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--single-process',
  '--no-zygote',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-features=site-per-process',
  '--js-flags=--max-old-space-size=256',
];

function launchOpts() {
  const opts = { headless: 'new', args: LAUNCH_ARGS };
  if (EXECUTABLE_PATH) opts.executablePath = EXECUTABLE_PATH;
  return opts;
}

let browserPromise = null;
async function getBrowser() {
  if (!browserPromise) browserPromise = puppeteer.launch(launchOpts());
  return browserPromise;
}

async function renderPanel(html, label) {
  const browser = LOW_MEMORY ? await puppeteer.launch(launchOpts()) : await getBrowser();
  const page = await browser.newPage();
  try {
    // Viewport MUST be the full artboard so `position:absolute; inset:0` fills it
    // and the clipped screenshot comes out exactly WIDTH x HEIGHT (the white-void fix).
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
    // Don't shoot until fonts are ready, or Montserrat falls back to Arial.
    await page.evaluateHandle('document.fonts.ready');
    await new Promise(r => setTimeout(r, 500));
    // Screenshot the exact artboard rectangle — never rely on element/page auto-size.
    // Newer Puppeteer returns a Uint8Array; wrap in Buffer so .toString('base64')
    // actually base64-encodes (Uint8Array.toString ignores the encoding arg).
    const buf = Buffer.from(await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
    }));

    // Verify the PNG is exactly WIDTH x HEIGHT. Anything else letterboxes downstream.
    const meta = await sharp(buf).metadata();
    console.log(`rendered ${label || 'panel'}: ${meta.width}x${meta.height}`);
    if (meta.width !== WIDTH || meta.height !== HEIGHT) {
      throw new Error(
        `${label || 'panel'} rendered ${meta.width}x${meta.height}, expected ${WIDTH}x${HEIGHT}`
      );
    }
    return buf.toString('base64');
  } finally {
    await page.close();
    if (LOW_MEMORY) { await browser.close(); }
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
    const front_png = await renderPanel(front_html, 'front');
    const back_png = await renderPanel(back_html, 'back');
    res.json({ front_png, back_png, width: WIDTH, height: HEIGHT });
  } catch (err) {
    console.error('render failed:', err);
    browserPromise = null;
    res.status(500).json({ error: String(err && err.message || err) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`render service listening on ${port}`));