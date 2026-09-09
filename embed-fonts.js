// Build step: embed the Montserrat weights each template uses as base64
// @font-face blocks, replacing the Google Fonts @import. This makes the
// templates fully self-contained so rendering needs no network font fetch
// (the render container has no Montserrat OS package). Run: node embed-fonts.js
//
// Re-run this whenever a template starts using a new font-weight.

const fs = require('fs');
const path = require('path');

const CSS_URL = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800;900&display=swap';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// weights each template references (keep in sync with the CSS font-weight rules)
const WEIGHTS = {
  'front-template.html': [500, 600, 800],
  'back-template.html':  [600, 700, 800, 900],
};

const IMPORT_LINE = /@import url\('https:\/\/fonts\.googleapis\.com\/css2\?family=Montserrat[^']*'\);/;

async function latinWoff2ByWeight() {
  const css = await (await fetch(CSS_URL, { headers: { 'User-Agent': UA } })).text();
  const blocks = css.split('@font-face').slice(1);
  const byWeight = {};
  for (const b of blocks) {
    // only the latin subset (covers ASCII); skip latin-ext/cyrillic/etc.
    if (!/unicode-range:[^;]*U\+0000-00FF/i.test(b)) continue;
    const w = (b.match(/font-weight:\s*(\d+)/) || [])[1];
    const url = (b.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+\.woff2)\)/) || [])[1];
    if (w && url) byWeight[w] = url;
  }
  return byWeight;
}

async function main() {
  const byWeight = await latinWoff2ByWeight();
  const needed = [...new Set(Object.values(WEIGHTS).flat())].sort();
  const b64 = {};
  for (const w of needed) {
    const url = byWeight[w];
    if (!url) throw new Error(`no latin woff2 found for Montserrat ${w}`);
    const buf = Buffer.from(await (await fetch(url, { headers: { 'User-Agent': UA } })).arrayBuffer());
    fs.writeFileSync(path.join(__dirname, `montserrat-${w}.woff2`), buf);   // keep source for reproducibility
    b64[w] = buf.toString('base64');
    console.log(`Montserrat ${w}: ${(buf.length / 1024).toFixed(1)}KB`);
  }

  for (const [file, weights] of Object.entries(WEIGHTS)) {
    const faces = weights.map((w) =>
      `  @font-face{ font-family:'Montserrat'; font-style:normal; font-weight:${w}; font-display:swap;\n` +
      `    src:url(data:font/woff2;base64,${b64[w]}) format('woff2'); }`
    ).join('\n');
    const p = path.join(__dirname, file);
    let html = fs.readFileSync(p, 'utf8');
    if (!IMPORT_LINE.test(html)) throw new Error(`Montserrat @import not found in ${file}`);
    html = html.replace(IMPORT_LINE,
      `/* Montserrat embedded (base64 woff2) — self-contained, no network fetch. */\n${faces}`);
    fs.writeFileSync(p, html);
    console.log(`embedded ${weights.join('/')} into ${file} -> ${(html.length / 1024).toFixed(1)}KB`);
  }
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
