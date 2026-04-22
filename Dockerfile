FROM node:22-alpine

WORKDIR /app

COPY . .

# Support both the normal repo layout (`backend/server.js`) and the
# browser-uploaded GitHub fallback where files ended up flattened at root.
RUN mkdir -p backend \
  && if [ -f server.js ] && [ ! -f backend/server.js ]; then cp server.js backend/server.js; fi \
  && if [ -f README.md ] && [ ! -f backend/README.md ]; then cp README.md backend/README.md; fi

ENV NODE_ENV=production
ENV BLOOMIE_HOST=0.0.0.0
EXPOSE 4181

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-4181}/api/health >/dev/null 2>&1 || exit 1

CMD ["node", "backend/server.js"]
