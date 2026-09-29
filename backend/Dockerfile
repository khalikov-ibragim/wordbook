FROM docker.io/node:20-alpine

WORKDIR /app

COPY package.json ./

RUN npm install --production

COPY src/ ./src/
COPY scripts/ ./scripts/

# Каталог для скачанных CSV и офлайн-бандлов (scripts/ensure-dictionary.js
# пишет в /app/data). Создаём ДО смены пользователя: /app принадлежит root,
# поэтому под USER node mkdir даёт EACCES. Владельцем делаем node, иначе
# скрипт не сможет писать в каталог уже во время выполнения.
RUN mkdir -p /app/data && chown node:node /app/data

USER node

CMD ["node", "src/server.js"]
