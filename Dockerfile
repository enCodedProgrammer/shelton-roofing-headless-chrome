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

# Montserrat as an OS font so Chrome finds it by family name (fixes the Arial
# fallback), plus fontconfig to register it. document.fonts.ready then resolves
# with the real font present — no network fetch needed at render time.
RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-montserrat fontconfig \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

# Bring in the templates + service. The .html files are read by template.js and
# are the source of truth for the n8n "Build Postcard HTML" node.
COPY server.js template.js front-template.html back-template.html ./

USER pptruser
EXPOSE 3000
CMD ["node", "server.js"]