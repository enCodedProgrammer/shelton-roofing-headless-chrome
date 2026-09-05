# Shelton Roofing Postcard — Template Build Spec

**For:** Claude Code, to produce two HTML template strings (`FRONT_TEMPLATE`, `BACK_TEMPLATE`)
that drop into the **"Build Postcard HTML"** Code node of the `w2w3w4-supabase` n8n workflow.
**Output of those templates:** rendered by the Puppeteer service → two PNGs → uploaded to
Supabase → mailed by Lob as a **6×9 landscape postcard**.

This spec exists because the current live template (see "What's wrong now") produces an
ugly, partly-broken card. Rebuild both panels to look like a real roofing-company direct-mail
piece while staying inside Lob's hard print rules and the pipeline's integration contract.

---

## 0. Non-negotiables — read before writing a single line

These three sections (0–2) are constraints. Break any of them and the card either fails the
workflow's own QA node, or gets rejected/mis-printed by Lob. The visual design (section 4)
is where you have creative freedom.

### Canvas & print geometry (Lob 6×9, landscape)

| Thing | Value | Notes |
|---|---|---|
| **Bleed size (the PNG you output)** | **2775 × 1875 px** | 9.25" × 6.25" @ 300 DPI. This is the full artboard. |
| Trim size (what the recipient sees) | 2700 × 1800 px | 9" × 6". 37.5 px gets cut off each edge. |
| Safe zone | keep text/logos ≥ **112 px** from every bleed edge | = 0.25" inside the trim line. Nothing important closer than this. |
| Bleed rule | backgrounds & photos must reach **all four edges** of 2775×1875 | no white/unprinted border. Full-bleed images, not padded ones. |
| Resolution | 300 DPI | already implied by the px dims. |
| Orientation | **landscape** | 2775 wide, 1875 tall. Front = image billboard; back = the offer + Lob's address block. |

### Lob address / "no-ink" zone — BACK PANEL ONLY

Lob stamps a white address block + USPS barcode over the back of the card. You must leave that
rectangle **completely empty** — no background color, no image, no text, no logo.

- **Size:** 4.0" × 2.375" = **1200 × 712 px**
- **Location:** bottom-right corner of the back, held off the trimmed edge.
  Use: `position:absolute; right:90px; bottom:90px; width:1200px; height:712px;`
- In artboard coordinates that reserved rectangle is roughly **x 1485→2685, y 1073→1785.**
  All back-panel content must avoid it.
- Also per Lob: don't put promo/address-looking text in the **bottom 2.375" (712 px)** band
  opposite the panel, and **no PII anywhere outside the no-ink zone** (the recipient address is
  Lob's job — do NOT print a recipient address in your creative).

Render a faint dashed outline for this zone **only** behind a `{{debug}}` flag so it never
ships. Ship = empty.

---

## 1. Pipeline integration contract (this is what actually bites)

The templates are strings inside a Code node, then two downstream nodes inspect the rendered
HTML **before** it's allowed to print. If you ignore these, the card silently gets marked
`Skipped` and never mails.

1. **Every `{{token}}` must have a matching key in the `fields` map** in "Build Postcard HTML."
   The node runs `tpl.replace(/\{\{(\w+)\}\}/g, ...)`. Any token you invent (e.g. `{{phone}}`,
   `{{license_no}}`, `{{qr_svg}}`, `{{logo_url}}`) must be added to `fields`, or it renders
   literally as `{{phone}}` — and then:

2. **The "Deterministic QA Checks" node hard-fails on any leftover `{{...}}`.** It regex-scans
   both panels for `\{\{\w+\}\}` and marks the card `Skipped` if it finds one. So: no orphan tokens.

3. **QA requires exactly ≥2 embedded base64 images per panel.** It counts
   `<img src="data:image/...;base64,...">` and fails if a panel has fewer than 2. Front naturally
   has before+after. **The back must also contain ≥2 embedded images** (the two thumbnails). If
   your back redesign uses a different image count, you MUST update that check in the QA node too
   — tell me and I'll adjust it. Don't just drop an image and let QA kill the run.

4. **QA requires the literal strings `2775px` and `1875px` in both panels.** Keep them in the
   `@page { size: 2775px 1875px }` and `html,body { width:2775px; height:1875px }` rules. Don't
   refactor them into a variable that removes the literal text.

5. **Images arrive as data URIs, already embedded** — `{{before_image_url}}` etc. resolve to
   `data:image/png;base64,....`. There is no network fetch at render time for photos. Treat the
   image tokens as `src` values, nothing else.

### Token contract — keep these names

Already wired into `fields` (safe to use as-is):

| Token | What it is |
|---|---|
| `{{before_image_url}}` | BEFORE photo, full-size, as a data URI |
| `{{after_image_url}}` | AFTER (AI-rendered roof) photo, data URI |
| `{{before_thumb_url}}` | same BEFORE image, for a smaller back-panel use |
| `{{after_thumb_url}}` | same AFTER image, for the back |
| `{{property_label}}` | street address string, e.g. `124 Hope Dr` |
| `{{roof_age}}` | number of years, e.g. `20` |
| `{{pin_svg}}` | injected map-pin SVG (see the pin bug below — likely dropping this) |
| `{{attribution}}` | `Imagery ©2026 Google` block (REQUIRED, Static Maps license) — keep it, small, on the front |

New tokens you may add (each needs a `fields` entry — flag them to me): `{{phone}}`,
`{{license_no}}`, `{{logo_url}}` (transparent PNG data URI), `{{qr_svg}}` (QRfy phone QR, planned).

---

## 2. Render-service requirement — the white-void root cause

The front currently renders with a big blank strip on the right because the Puppeteer page
viewport is **not** the full artboard, so `position:absolute; inset:0` fills a smaller viewport
and the exported PNG isn't a true 2775×1875. Fix in the render service (`render-service/server.js`),
not the HTML:

- Set viewport explicitly before screenshotting each panel:
  `await page.setViewport({ width: 2775, height: 1875, deviceScaleFactor: 1 });`
- Screenshot the exact artboard:
  `await page.screenshot({ clip: { x:0, y:0, width:2775, height:1875 }, type:'png' });`
  (or `fullPage:false` with body pinned to those dims — either way the PNG must come out
  **exactly 2775×1875**.)
- **Wait for fonts before shooting:** `await page.evaluateHandle('document.fonts.ready');`
  otherwise you get the Arial fallback you're seeing now.
- Confirm each returned PNG is 2775×1875 (log `sharp(buf).metadata()` or equivalent). If it
  isn't, everything downstream letterboxes → the void.

The HTML should also be defensive: `html,body{width:2775px;height:1875px;margin:0;overflow:hidden}`
and the root layer `position:absolute; inset:0`.

---

## 3. What's wrong now (fix list, from the live Lob proof)

1. **Front white void** — right ~40% blank. → viewport fix in §2 + full-bleed layout in §4.
2. **Doubled pin on BEFORE** — the BEFORE photo is the *marked* Static Maps image (Google's red
   teardrop is baked in), and the template overlays a second `{{pin_svg}}` on top. AFTER has only
   the overlay. Result: 2 pins vs 1. **Fix:** feed the **clean (unmarked)** satellite image to the
   BEFORE pane and stop overlaying pins on baked-in-marker imagery. My recommendation: **drop the
   map pin from the card entirely** — a before/after roof comparison doesn't need a location pin,
   and the address label already identifies the house. If Israel wants to keep a pin, put ONE on
   each pane and only over clean imagery. (Bonus: using clean-before also fixes the scoring bug
   where the QA scorer penalizes the render for "removing the red pin.")
3. **Fonts fell back to Arial** — Montserrat never loaded. → embed the font (base64 `@font-face`
   in the HTML, or install `fonts-montserrat` in the Dockerfile) + `document.fonts.ready` wait.
   Pick a real weight range (700/800 for headlines, 500/600 for body).
4. **Back thumbnails cramped & drifting into the address zone.** → constrain all back content to
   the usable area in §4, keep the bottom-right 1200×712 empty.
5. **Ribbons tiny, address label invisible, generic look.** → §4 redesign.

---

## 4. Design direction

Goal: looks like a premium local roofer paid a designer, not an auto-generated card. Confident,
clean, high-contrast, trustworthy. Not busy.

### Brand tokens (carry into `:root`)

```
--navy:    #0D2444;   /* primary / dark panels, headline text on light */
--gold:    #F5B91E;   /* CTA + AFTER accent — the "action" color */
--red:     #E33329;   /* single alarm word only, used sparingly */
--ink:     #0B0B0B;   /* near-black text / BEFORE ribbon */
--paper:   #FFFFFF;   /* back background, keeps ink coverage sane */
--mist:    #F2F5F9;   /* soft panel fills if needed */
```

Return address (goes in the FROM block via Lob, not the creative — for reference only):
**Brad Shelton · Shelton Roofing · 135 Aviation Way STE 15 · Watsonville, CA 95076-2985.**

Type: Montserrat (embedded). Headlines 800, tight leading. Body 500–600. Generous size — this
is read at arm's length; nothing under ~34 px.

### FRONT — the billboard (image-led, zero white)

- **Full-bleed 50/50 before/after split**, each pane 1387.5 × 1875, photos `object-fit:cover`
  so they fill edge-to-edge (source is 1280×1280 square; cropping top/bottom is fine).
- **Center divider:** thin white rule, 10–14 px.
- **Corner banners** for BEFORE / AFTER — large, angled or blocked, ~64 px bold. BEFORE = `--ink`
  on white text; AFTER = `--gold` with `--ink` text. Anchor them so they read instantly.
- **Bottom scrim across both panes:** a subtle dark gradient (transparent → rgba(13,36,68,.85))
  in the lower ~22%, with the property address (`{{property_label}}`) centered in white, ~44 px,
  600. This is the label that's currently missing.
- Optional top overlay headline (small, both panes), e.g. *"See your home with a brand-new roof."*
  Keep it out of the safe margin (≥112 px from edges).
- **`{{attribution}}`** bottom-left, ~22 px, white with a soft shadow. Required. Keep it.
- **No map pins** (per fix #2, unless Israel opts in).

### BACK — the close (offer + CTA, address zone empty)

Usable area = everything **except** the bottom-right `1200×712` rectangle. Practical layout:

- **Top band (full width, y ≈ 130 → 300):** Shelton Roofing logo lockup (`{{logo_url}}`
  transparent PNG; until we have it, a clean type lockup: "SHELTON ROOFING" 800 in `--navy`
  with a small roofline mark). Optional license line, e.g. `Lic #{{license_no}}`.
- **Left column (x 130 → ~1400, y 340 → 1745):** the message.
  - Headline, ~76 px, 800, `--navy`, tight leading. One alarm word in `--red` (e.g.
    *"YOUR ROOF MAY BE APPROACHING AN **IMPORTANT INSURANCE MILESTONE**"*). Keep it to ~4 lines.
  - Subhead, ~40 px: `{{property_label}} — roof age approximately {{roof_age}} years.`
  - One clear offer + **CTA button**: `--gold` block, `--ink` text, 800, ~44 px,
    e.g. **FREE ROOF EVALUATION**. Big tap-target feel.
  - Phone `{{phone}}` (large, near the CTA) and/or `{{qr_svg}}` QR (≥ 1"×1" = 300×300 px,
    with a "Scan to call" caption) — place the QR in the **top-right**, well above the address
    zone (y < 1000), never bottom-right.
  - A one-line trust signal: *Locally owned · Licensed & insured · Free estimates.*
- **Right area, TOP ONLY (x 1450 → 2645, y 130 → ~1000):** a tidy before→after thumbnail pair
  (`{{before_thumb_url}}`, `{{after_thumb_url}}`) with tiny BEFORE/AFTER captions and a small
  arrow between them. **This is the ≥2-images-on-back requirement (§1.3) — keep both.** Do NOT let
  these drop below y ≈ 1050; below that on the right is Lob's block.
- **Bottom-right 1200×712:** empty. No background fill bleeding into it.

Balance the empty feeling the current back has: let the headline + CTA occupy the left with
real presence, and keep whitespace intentional rather than a big dead corner.

---

## 5. Acceptance checklist (Claude Code: verify before handing back)

- [ ] Two template strings returned; both contain literal `2775px` and `1875px`.
- [ ] No `{{token}}` in either template lacks a `fields` entry (list any new ones for Israel to wire).
- [ ] Front: photos full-bleed, no white gap at any zoom; BEFORE/AFTER banners legible; address
      scrim visible; `{{attribution}}` present; no map pin (or one pin per pane over clean imagery).
- [ ] Back: bottom-right 1200×712 rectangle is empty (fill it with the dashed debug outline behind
      a flag and confirm it's clear when the flag is off); ≥2 embedded images present; no recipient
      address / PII in the creative.
- [ ] Montserrat embedded; render waits on `document.fonts.ready`.
- [ ] Render service outputs PNGs measured at exactly 2775×1875.
- [ ] A local test render of a sample lead (`124 Hope Dr`, roof_age `20`) looks like a real card.

---

## 6. Hand-off notes for the pipeline side (not Claude Code's job, but needed for a clean run)

- Feed the **clean** satellite image to `{{before_image_url}}`/`{{before_thumb_url}}` (currently
  it's the marked one) — small change in "Build Postcard HTML" where it reads `Prep Before Image`.
- If any new token is added, extend the `fields` map in the same node.
- If the back image count changes from 2, update the count check in "Deterministic QA Checks."
- Before a real batch: restore Confidence Tier thresholds to 95/80 (currently 30/20/10 for testing).