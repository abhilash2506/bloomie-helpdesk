FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY backend ./backend
COPY bloomie-helpdesk-v1.html ./
COPY manifest.webmanifest ./
COPY sample-sheet.csv ./

ENV NODE_ENV=production
ENV BLOOMIE_HOST=0.0.0.0
EXPOSE 4181

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-4181}/api/health >/dev/null 2>&1 || exit 1

CMD ["node", "backend/server.js"]
