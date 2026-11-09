FROM node:22-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=production PORT=8787 DB_FILE=/data/notebook.db
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 8787
USER node
CMD ["node", "--no-warnings", "server/index.mjs"]
