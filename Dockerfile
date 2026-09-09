# Base image and puppeteer npm version MUST match exactly, or Puppeteer looks
# for a Chrome build that isn't in the image and fails with
# "Could not find Chrome (ver. ...)". Both pinned to 23.11.1 here.
FROM ghcr.io/puppeteer/puppeteer:23.11.1

USER root
WORKDIR /app

# Puppeteer's bundled Chrome for Testing lives at a known path in this image.
# Point puppeteer straight at it and skip the cache-dir lookup entirely, so a
# version drift can never reintroduce the "Could not find Chrome" error.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer

# Fonts (Montserrat + Kaushan Script) are embedded directly in the templates as
# base64 @font-face, so no OS font package is needed and there is no network font
# fetch at render time. To refresh the embedded weights, run: node embed-fonts.js

COPY package*.json ./
RUN npm install --omit=dev

# Bring in the templates + service. The .html files are read by template.js and
# are the source of truth for the n8n "Build Postcard HTML" node.
COPY server.js template.js front-template.html back-template.html ./

USER pptruser
EXPOSE 3000
CMD ["node", "server.js"]