// Local smoke test for the postcard templates.
//
//   1. start the render service:   npm start           (listens on :3000)
//   2. in another shell:           node test-render.js
//
// It synthesizes placeholder before/after photos, fills the token map with a
// sample lead (124 Hope Dr, roof age 20), POSTs both panels to /render, and
// saves the returned PNGs to ./postcard-test so you can eyeball them.
//
// Env: RENDER_URL (default http://localhost:3000/render), RENDER_AUTH_TOKEN,
//      DEBUG_NOINK=1 to show the Lob no-ink zone outline on the back.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { FRONT_TEMPLATE, BACK_TEMPLATE } = require('./template');

const RENDER_URL = process.env.RENDER_URL || 'http://localhost:3000/render';
const AUTH_TOKEN = process.env.RENDER_AUTH_TOKEN || '';
const OUT_DIR = path.join(__dirname, 'postcard-test');

// Real sample imagery (square, like Google Static Maps). The pipeline delivers
// these already as data URIs; here we read the local PNGs and encode them.
async function imageUri(file) {
  const png = await sharp(path.join(__dirname, file)).png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

function fill(tpl, fields) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (!(k in fields)) throw new Error(`template token {{${k}}} has no field — QA would fail`);
    return fields[k];
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const beforeImg = await imageUri('before_clean.png');
  const afterImg  = await imageUri('after_render.png');

  const fields = {
    before_image_url: beforeImg,
    after_image_url:  afterImg,
    before_thumb_url: beforeImg,
    after_thumb_url:  afterImg,
    property_label:   '124 Hope Dr',
    roof_age:         '20',
    attribution:      'Imagery ©2026 Google',
    phone:            '(831) 464-4120',
    debug:            process.env.DEBUG_NOINK ? 'debug' : '',
  };

  const front_html = fill(FRONT_TEMPLATE, fields);
  const back_html  = fill(BACK_TEMPLATE, fields);

  console.log(`POST ${RENDER_URL} ...`);
  const res = await fetch(RENDER_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(AUTH_TOKEN ? { 'x-auth-token': AUTH_TOKEN } : {}),
    },
    body: JSON.stringify({ front_html, back_html }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`render service ${res.status}: ${text}`);
  }

  const { front_png, back_png, width, height } = await res.json();
  fs.writeFileSync(path.join(OUT_DIR, 'front.png'), Buffer.from(front_png, 'base64'));
  fs.writeFileSync(path.join(OUT_DIR, 'back.png'),  Buffer.from(back_png, 'base64'));

  const f = await sharp(path.join(OUT_DIR, 'front.png')).metadata();
  const b = await sharp(path.join(OUT_DIR, 'back.png')).metadata();
  console.log(`service reports ${width}x${height}`);
  console.log(`saved postcard-test/front.png  (${f.width}x${f.height})`);
  console.log(`saved postcard-test/back.png   (${b.width}x${b.height})`);
  const ok = f.width === 2775 && f.height === 1875 && b.width === 2775 && b.height === 1875;
  console.log(ok ? 'OK: both PNGs are exactly 2775x1875' : 'WARNING: unexpected dimensions');
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
