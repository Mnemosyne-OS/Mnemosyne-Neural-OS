<div align="center">

<img src="https://raw.githubusercontent.com/Mnemosyne-OS/Mnemosyne-Neural-OS/main/assets/banner-mnemosyne-os.png" width="100%" alt="Mnemosyne OS — Your memory. Your machine. Your rules." />

🌐 [**mnemosyne-os.io**](https://mnemosyne-os.io) — the product, for builders · [**mnemosyne-os.com**](https://mnemosyne-os.com) — the company, press & labs · [**docs.mnemosyne-os.io**](https://docs.mnemosyne-os.io) — the documentation

</div>

# @mnemosyne_os/cartridge-sdk

Official Cartridge SDK for **Mnemosyne OS** — the secure `postMessage` bridge
for sandboxed in-app cartridges (iframe widgets rendered inside the Infinity
Edition canvas).

This is **the one canonical `MnemoCartridgeSDK`**. In-repo cartridges re-export
it (`export * from '@mnemosyne_os/cartridge-sdk'`); a drift test fails loudly
on any copy that reimplements the transport.

> Building an **external process** (own window, WebSocket `:7799`) instead of
> an in-app cartridge? Use [`@mnemosyne_os/sdk`](https://www.npmjs.com/package/@mnemosyne_os/sdk).
> Routing guide: `docs/architecture/51_developer-surfaces-routing.md`.

## Install

```bash
npm i @mnemosyne_os/cartridge-sdk        # published package
# or, inside the Mnemosyne OS monorepo:
pnpm add @mnemosyne_os/cartridge-sdk --workspace --filter <your-app>
```

## Boot sequence (recommended)

```ts
import { MnemoCartridgeSDK } from '@mnemosyne_os/cartridge-sdk';

const sdk = new MnemoCartridgeSDK('@mnemosyne-plugins/my-app');

// 1. Own sandbox vault — isolated until the HUMAN unlocks permanence.
const sb = await sdk.ensureSandbox();          // → { vault: 'APP-…', unlocked }

// 2. Declare your vault tile — the host computes the numbers, even app-closed.
await sdk.describeVaultTile({
  icon: '🏝️',
  metrics: [{ label: 'Contacts', spine: 'SOCIAL_CONTACT' }],
});

// 3. Write into YOUR vault (SHA-256 dedup host-side).
await sdk.socialIngest(sb.vault, 'Contact: Léa. …', 'SOCIAL_CONTACT');
```

Every call goes through `invoke(action, payload?, timeoutMs?)` — an action
whitelisted by the host registry (`docs/architecture/52` lists them all).
Unknown/denied actions reject immediately (the host replies to every request);
outside a host iframe, calls reject immediately too. The default timeout is
5 minutes and is deliberately human-paced: the FIRST call of a permission-gated
action can open the host's native authorization dialog and wait for the human's
click — a short bound would race them and boot the cartridge into a dead
session. Use `timeoutMs: 0` only for user-paced OS dialogs (file pickers).

## Streaming a response token by token

`invoke()` returns one buffered reply. When the host action produces output
incrementally — a chat turn, a long generation — `stream()` delivers it as it
arrives so your bubble fills live instead of sitting blank for 30 s:

```ts
const { text } = await sdk.stream('hermes.chatStream', { messages }, {
  onChunk: (t) => appendToBubble(t),   // fires 0..N times, in order
  signal: abortController.signal,      // optional: cancel mid-stream
});
// `text` is the full accumulated reply; StreamResult may also carry `data`.
```

The contract, correlated per request (two concurrent streams never interleave):

- **`onChunk(text)`** fires for each `MNEMO_PLUGIN_CHUNK`, in order. A throw in
  your callback is swallowed — one bad render can't break the stream.
- The Promise **resolves** on `MNEMO_PLUGIN_DONE` with `{ text, data? }`.
- An upstream failure **rejects** (`MNEMO_PLUGIN_ERROR`) — it NEVER arrives as a
  short-but-complete answer. A truncated stream is an error you can show, not a
  silent lie. Keep whatever `text` you accumulated and mark it interrupted.
- **Cancellation**: abort the `signal` (e.g. on tab close / unmount) — the SDK
  tells the host to stop the upstream work and rejects with an `AbortError`.
  Always wire this in a React `useEffect` cleanup so a closed panel stops
  spending.
- **Timeout** here is an *inactivity* window (default 180 s, reset on every
  chunk), not an absolute cap — a legitimately long, tool-running agent turn
  stays alive while a genuinely dead bridge still settles.

Any whitelisted action is stream-consumable: one that doesn't emit chunks
simply resolves via `DONE` with no `onChunk` calls, so `stream()` is a safe
superset of `invoke()` for actions that *might* stream.

## Inheriting the host's look (design tokens)

The OS broadcasts its live design tokens — every CSS variable of the active
theme, computed, the user's custom accent included — into your iframe on load
and on every change (theme flip, Appearance tweak). One line inherits it all:

```ts
import { onHostConfig } from '@mnemosyne_os/cartridge-sdk';

onHostConfig(); // applies data-theme + all tokens onto <html>, live
```

Then style with the shell's own variables and your app follows the user's
theme with zero further code:

```css
.card   { background: var(--bg-panel);  border: 1px solid var(--border-subtle); }
.action { color: var(--accent);         background: var(--accent-soft); }
body    { background: var(--bg-void);   color: var(--text-primary); }
```

Keep hex fallbacks in your CSS (`var(--accent, #7c4dff)`) — they are what
renders when the app runs outside the OS (plain `vite dev`). To observe without
applying, `onHostConfig(cfg => …, { apply: false })`; it returns an
unsubscribe. `applyDesignTokens(tokens)` is exported for manual control.

## Choosing the memory a generation leans on

The host injects the retrieved memory **main-side**: the model sees it, your
cartridge never does. You choose the scope, and all three modes are real:

```ts
await sdk.inferModel({ prompt, disableRAG: true });              // no memory at all
await sdk.inferModel({ prompt });                                // every ACTIVE vault (federated)
await sdk.inferModel({ prompt, vaultId: 'RECHERCHE' });          // one vault
await sdk.inferModel({ prompt, vaultIds: ['RECHERCHE', 'NOTES'] }); // a mix (max 12)
```

Pass `ragQuery` whenever `prompt` also carries long instructions: the retrieval
embeds `ragQuery` instead, so the search runs on the user's intent rather than
drowning in your instruction block. Vault ids and display names come from
`sdk.scanTree()` — filter out `manifest.appSandbox` entries, they are other
cartridges' walled-off stores, not the user's memory.

## Telling the user what it cost

```ts
const before = (await sdk.creditsStatus()).data?.usedUsdMicro;
await sdk.inferModel({ prompt });
const after  = (await sdk.creditsStatus()).data?.usedUsdMicro;
```

The delta is the amount **actually billed**, not an estimate. Only the Mnemosyne
Cloud route is metered: local inference costs nothing, and a personal API key is
billed by the provider, which the host never sees. Those two are different
statements — say which one applies instead of displaying a misleading `0`.

## Deleting what you created

Two different things, and your UI must not blur them:

```ts
await sdk.forgetSandbox([12, 13]);          // rows YOU wrote in YOUR sandbox — irreversible
await sdk.deleteProjectDir('C:\\…\\my-app'); // the folder on disk — no trash can
```

`deleteProjectDir` is fenced host-side: home-scoped, never the home root nor a
direct child of it, and the folder must carry a project manifest
(`app-spec.json` / `mnemo-plugin.json` / `BRIEF.md`) or the host answers
`NOT_A_PROJECT`. Collect the human's explicit confirmation first — the host will
not ask on your behalf.

## Security model

- The iframe is sandboxed: no window globals, no Node/Electron access.
- Replies are accepted from `window.parent` only, targeted to the host origin.
- Your app id is bound host-side (trusted `pluginId`): sandbox operations can
  only ever reach **your own** vault.
- Sandbox vaults are walled off (no federated RAG, no neural map, no Dream
  State) until the human unlocks permanence — see `docs/architecture/58`.

---

## The OS your code talks to

<img src="https://raw.githubusercontent.com/Mnemosyne-OS/Mnemosyne-Neural-OS/main/assets/infinite-canvas.jpg" width="100%" alt="Mnemosyne OS — Infinity Edition: the infinite canvas, the image gallery, MnemoHub and the living memory" />

*Mnemosyne OS — Infinity Edition v1.4.0 · The Infinite Vision — [download](https://mnemosyne-os.io/download) · [mnemosyne-os.io](https://mnemosyne-os.io) · [mnemosyne-os.com](https://mnemosyne-os.com)*

---

## Where Mnemosyne OS lives

Published by XPACEGEMS LLC. Its official addresses:

- Product site: <https://mnemosyne-os.io>
- Organizations: <https://mnemosyne-os.com>
- Documentation: <https://docs.mnemosyne-os.io>
- Source: <https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS>
- Packages: the npm scope `@mnemosyne_os`
