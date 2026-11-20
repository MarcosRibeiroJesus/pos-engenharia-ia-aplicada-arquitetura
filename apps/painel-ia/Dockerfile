# Painel de IA: imagem mínima, sem dependências de npm, rodando como usuário sem privilégios.
FROM node:24-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORTA=4317 \
    CLAUDE_PROJECTS_DIR=/transcripts \
    DADOS_DIR=/dados

WORKDIR /app
COPY package.json README.md ./
COPY bin ./bin
COPY src ./src
COPY public ./public
# Atualiza os pacotes do sistema e tira o que o painel não usa em execução (npm, npx, corepack, yarn):
# menos superfície e menos vulnerabilidade herdada da imagem base (Trivy).
RUN apk upgrade --no-cache \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn* \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg \
 && mkdir -p /dados /transcripts && chown node:node /dados

USER node
VOLUME ["/dados"]
EXPOSE 4317
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://127.0.0.1:4317/healthz >/dev/null || exit 1
CMD ["node", "bin/pos-painel-ia.js"]
