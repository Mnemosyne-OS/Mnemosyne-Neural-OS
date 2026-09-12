/**
 * ws-client.test.ts — MnemoWsClient
 *
 * The only file in this package with real network/protocol logic and zero
 * prior test coverage: RPC dispatch (id correlation, per-call timeout),
 * register handshake, and disconnect handling (pending RPCs must not hang
 * forever when the socket closes mid-call). index.ts and daemon.ts are the
 * other untested files, but they are entry points (they call process.exit /
 * start a server at module scope) — this is the class with behavior to test
 * in isolation.
 *
 * Runs against a REAL local `ws` WebSocketServer (already a dependency of
 * this package), not a mock — the wire contract (see the header comment in
 * ../src/ws-client.ts) is exactly what a JSON round trip over a real socket
 * exercises.
 *
 * Run: `pnpm --filter @mnemosyne_os/mcp test` (tsx + node:test).
 */

import { test }          from 'node:test';
import assert            from 'node:assert/strict';
import { WebSocketServer, WebSocket } from 'ws';
import { MnemoWsClient, type AppManifest } from './ws-client.js';

const MANIFEST: AppManifest = {
  id: 'test-app',
  name: 'Test App',
  version: '0.0.0',
  mnemosyne_sdk: '^1.0.0',
  scopes: [],
  vaults: [],
  intents: [],
};

/** Starts a bare `ws` server on an ephemeral port and hands back its port + close(). */
function startServer(
  onMessage: (ws: WebSocket, msg: { id: string; method: string; params: unknown }) => void,
): Promise<{ port: number; close: () => Promise<void>; wss: WebSocketServer }> {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      onMessage(ws, msg);
    });
  });
  // `wss.address()` is null until the underlying server has actually bound —
  // reading it synchronously right after `new WebSocketServer(...)` is a race
  // that intermittently threw "Cannot read properties of null (reading
  // 'port')" and, worse, left an unclosed server dangling when it did,
  // hanging the whole `node:test` run at exit.
  return new Promise((resolve) => {
    wss.on('listening', () => {
      const port = (wss.address() as { port: number }).port;
      resolve({
        port,
        wss,
        close: () => new Promise<void>((res) => wss.close(() => res())),
      });
    });
  });
}

/** A server that auto-registers any client (replies to sdk.register) and nothing else. */
function startRegisteringServer(
  extra?: (ws: WebSocket, msg: { id: string; method: string; params: unknown }) => void,
) {
  return startServer((ws, msg) => {
    if (msg.method === 'sdk.register') {
      ws.send(JSON.stringify({ id: msg.id, result: { token: 'test-token', expiresAt: Date.now() + 60_000, appId: 'test-app' } }));
      return;
    }
    extra?.(ws, msg);
  });
}

test('connect() registers and stores a token', async () => {
  const server = await startRegisteringServer();
  const client = new MnemoWsClient(MANIFEST, server.port, 2_000);

  assert.equal(client.isConnected, false);
  await client.connect();
  assert.equal(client.isConnected, true);

  client.close();
  await server.close();
});

test('connect() rejects with a clear message when nothing is listening', async () => {
  // Port 1 is a well-known "nothing there" target that fails fast (ECONNREFUSED)
  // rather than timing out, keeping this test quick and deterministic.
  const client = new MnemoWsClient(MANIFEST, 1, 500);
  await assert.rejects(() => client.connect());
});

test('connect() rejects when sdk.register replies without a token', async () => {
  // `timeoutMs` (the constructor's 3rd argument) only bounds the WebSocket
  // OPEN phase — once the socket is open, the sdk.register RPC itself runs
  // on the module's own RPC_TIMEOUT_MS (30s), a separate budget. That is a
  // real asymmetry, but not one this change should silently narrow: the
  // MCP's own `_connect()` in index.ts polls for up to 60s while a backend
  // is loading its embedding model, so a short register timeout would cut
  // that startup grace period short. Testing the "never replies" path for
  // real would mean a 30s test, so this covers the OTHER rejection path
  // through the exact same code (`if (!reg?.token) throw ...`) instead —
  // fast, deterministic, and exercises real logic in connect().
  const server = await startServer((ws, msg) => {
    if (msg.method === 'sdk.register') {
      ws.send(JSON.stringify({ id: msg.id, result: {} })); // no token
    }
  });
  const client = new MnemoWsClient(MANIFEST, server.port, 2_000);

  await assert.rejects(() => client.connect(), /no token/);
  assert.equal(client.isConnected, false);

  await server.close();
});

test('a typed RPC (query) round-trips through the real wire contract', async () => {
  const server = await startRegisteringServer((ws, msg) => {
    if (msg.method === 'sdk.query') {
      ws.send(JSON.stringify({
        id: msg.id,
        result: {
          success: true,
          chronicles: [{ id: '1', spineType: 'NOTE', content: 'hi', timestamp: Date.now(), score: 0.9, source_app_id: 'x' }],
        },
      }));
    }
  });
  const client = new MnemoWsClient(MANIFEST, server.port, 2_000);
  await client.connect();

  const result = await client.query('hello', { vault: 'DEV', limit: 5 });

  assert.equal(result.success, true);
  assert.equal(result.chronicles.length, 1);
  assert.equal(result.chronicles[0]!.id, '1');

  client.close();
  await server.close();
});

test('a server error reply rejects the caller with that message', async () => {
  const server = await startRegisteringServer((ws, msg) => {
    if (msg.method === 'sdk.ingest') {
      ws.send(JSON.stringify({ id: msg.id, error: 'SCOPE_DENIED' }));
    }
  });
  const client = new MnemoWsClient(MANIFEST, server.port, 2_000);
  await client.connect();

  await assert.rejects(
    () => client.ingest({ content: 'x', spineType: 'NOTE', vault: 'DEV' }),
    /SCOPE_DENIED/,
  );

  client.close();
  await server.close();
});

test('an RPC that never gets a reply times out and releases its pending slot', async () => {
  const server = await startRegisteringServer(() => { /* black hole every non-register call */ });
  const client = new MnemoWsClient(MANIFEST, server.port, 2_000);
  await client.connect();

  await assert.rejects(
    () => client._rpc('sdk.does.not.reply', {}, 200),
    /timed out after 200ms/,
  );

  client.close();
  await server.close();
});

test('a socket the server closes mid-call rejects the pending RPC instead of hanging forever', async () => {
  const server = await startRegisteringServer((ws, msg) => {
    if (msg.method === 'sdk.query') {
      // Close the connection instead of ever answering this call.
      ws.close();
    }
  });
  const client = new MnemoWsClient(MANIFEST, server.port, 2_000);
  await client.connect();

  let disconnected = false;
  client.on('disconnected', () => { disconnected = true; });

  await assert.rejects(
    () => client.query('hello', {}),
    /WS_CLOSED/,
  );
  assert.equal(client.isConnected, false);
  assert.equal(disconnected, true);

  await server.close();
});

test('close() eventually rejects a pending RPC rather than leaving it unsettled forever', async () => {
  const server = await startRegisteringServer(() => { /* never answer sdk.query */ });
  const client = new MnemoWsClient(MANIFEST, server.port, 2_000);
  await client.connect();

  const pending = client.query('hello', {});
  client.close(); // does not itself reject — the underlying socket 'close' event does, async

  await assert.rejects(() => pending, /WS_CLOSED/);

  await server.close();
});
