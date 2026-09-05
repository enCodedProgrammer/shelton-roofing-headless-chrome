// Shelton Roofing postcard templates.
//
// FRONT_TEMPLATE / BACK_TEMPLATE are the exact contents of front-template.html /
// back-template.html, read from disk so the exported strings and the previewable
// .html files can never drift apart. Paste the .html file contents into the n8n
// "Build Postcard HTML" Code node (they ARE the template strings).
//
// Token contract — every {{token}} used below must have a matching key in the
// node's `fields` map, or the "Deterministic QA Checks" node marks the card Skipped.
//
//   FRONT uses:  before_image_url, after_image_url, property_label, attribution
//   BACK  uses:  before_thumb_url, after_thumb_url, roof_age, phone, debug
//                (the Shelton logo AND the office QR code are embedded directly
//                 as base64 — no token, same on every card)
//
//   Already wired: before/after image + thumb urls, property_label, roof_age, attribution
//
//   NEW — must be added to `fields`:
//     phone   -> Shelton's phone string, e.g. '(831) 464-4120'
//     debug   -> '' to ship; 'debug' to show the Lob no-ink zone outline
//
//   Not used here (safe to leave in fields, or drop): pin_svg, license_no, qr_svg

const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

const FRONT_TEMPLATE = read('front-template.html');
const BACK_TEMPLATE = read('back-template.html');

module.exports = { FRONT_TEMPLATE, BACK_TEMPLATE };
