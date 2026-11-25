FROM node:24-bookworm-slim
WORKDIR /opt/ax
COPY --chown=node:node app/ ./app/
RUN mkdir -p /data && chown node:node /data
ENV AUTH_MODE=oidc HOST=0.0.0.0 PORT=8766 DATA_DIR=/data
USER node
VOLUME ["/data"]
EXPOSE 8766
CMD ["node", "app/server/api/server.cjs"]
