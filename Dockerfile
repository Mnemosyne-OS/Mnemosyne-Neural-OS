# Introspection harness for MCP directories (Glama and the like).
#
# This is not a way to run Mnemosyne OS. Mnemosyne OS is a desktop application
# that keeps your memory on your own machine. There is no server edition and no
# hosted mode, and this image does not contain one.
#
# What it does contain is the thin stdio MCP bridge published as
# @mnemosyne_os/mcp (MIT). A directory can start it in a sandbox and read the
# tool catalogue through the protocol itself: initialize, tools/list,
# prompts/list, resources/list. That is the only reason this file exists.
#
# Every tool this bridge exposes is forwarded over a local websocket to the
# Mnemosyne OS desktop app (default port 7799). Inside a container there is no
# such app, so the catalogue answers and the tool calls report that Mnemosyne OS
# is not reachable. That is the intended behaviour here, not a broken build.
#
# The version is read from server.json, the registry manifest, so the catalogue
# this image publishes cannot drift from the one the manifest declares.

FROM node:22-alpine

LABEL org.opencontainers.image.title="Mnemosyne OS MCP bridge (introspection only)"
LABEL org.opencontainers.image.description="Stdio MCP bridge used by directories to read the tool catalogue. Answering a tool call requires the Mnemosyne OS desktop app on the same machine."
LABEL org.opencontainers.image.source="https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS"
LABEL org.opencontainers.image.url="https://mnemosyne-os.io"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /srv
COPY server.json ./

RUN VERSION="$(node -p "require('./server.json').packages[0].version")" \
 && echo "installing @mnemosyne_os/mcp@${VERSION} (from server.json)" \
 && npm install -g "@mnemosyne_os/mcp@${VERSION}" \
 && rm -rf /root/.npm

USER node
ENTRYPOINT ["mnemosyne-mcp"]
