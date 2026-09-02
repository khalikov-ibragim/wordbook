FROM docker.io/node:20-alpine

WORKDIR /app

COPY package.json ./

RUN npm install --production

COPY src/ ./src/
COPY scripts/ ./scripts/

USER node

CMD ["node", "src/server.js"]
