# Puppeteer's official image ships a matching Chrome plus every system library
# it needs. Installing Chrome onto a bare Node image is the usual source of
# "Failed to launch the browser process" on hosted platforms.
FROM ghcr.io/puppeteer/puppeteer:23.0.0

USER root
WORKDIR /app

COPY package*.json ./
# Chrome is already present in this image; skip Puppeteer's own download.
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm install --omit=dev

COPY server.js ./

USER pptruser
EXPOSE 3000
CMD ["node", "server.js"]
