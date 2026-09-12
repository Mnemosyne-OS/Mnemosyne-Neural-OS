# syntax=docker/dockerfile:1

# Mnemosyne OS MCP server.
#
# Build context is the REPOSITORY ROOT, not this folder. The server is one
# package of a pnpm workspace and its bundle inlines a sibling package,
# @mnemosyne_os/agent-transcripts.
#
#   docker build -f packages/mcp/Dockerfile -t mnemosyne-mcp .
#   docker run --rm -i mnemosyne-mcp
#
# WHAT THIS CONTAINER CAN AND CANNOT DO, so nothing here is a surprise:
#
#   It answers `initialize` and `tools/list` on its own. Measured on this
#   build with nothing else running: 23 tools.
#
#   Tool CALLS are relayed to the Mnemosyne OS desktop application over
#   ws://127.0.0.1:7799. In a container with no app reachable they return a
#   named error instead of hanging. That is the honest shape of this server:
#   it is a client of an application the human runs, not a standalone service,
#   and it holds no data of its own.
#
# MNEMO_AUTOLAUNCH=0 is set on purpose. Left unset, a tool call would first try
# to start a local backend. In a container that attempt cannot succeed and only
# delays the error, so the refusal is made immediate and named.

FROM node:22-slim AS build
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY examples ./examples
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm --filter @mnemosyne_os/mcp run build
# The runtime needs the two real dependencies and nothing else. Stripping the
# dev block here also removes the `workspace:` specifiers, which npm cannot
# resolve outside a pnpm workspace.
RUN node -e "const p=require('/src/packages/mcp/package.json'); delete p.devDependencies; delete p.scripts; require('fs').writeFileSync('/runtime-package.json', JSON.stringify(p, null, 2))"

FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    MNEMO_AUTOLAUNCH=0
WORKDIR /app
COPY --from=build /runtime-package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /src/packages/mcp/dist/index.js ./dist/index.js
COPY --from=build /src/packages/mcp/skills ./skills
COPY --from=build /src/packages/mcp/LICENSE ./LICENSE
USER node
ENTRYPOINT ["node", "/app/dist/index.js"]
