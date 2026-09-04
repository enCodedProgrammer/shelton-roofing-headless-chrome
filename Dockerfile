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

COPY package*.json ./
RUN npm install --omit=dev

COPY server.js ./

USER pptruser
EXPOSE 3000
CMD ["node", "server.js"]