**@mnemosyne_os/cartridge-sdk**: Official Cartridge SDK for Mnemosyne OS. A secure postMessage bridge for sandboxed in-app cartridges, the iframe widgets on the canvas. The one canonical MnemoCartridgeSDK.

<div align="center">

<img src="https://raw.githubusercontent.com/Mnemosyne-OS/Mnemosyne-Neural-OS/main/assets/banner-mnemosyne-os.png" width="100%" alt="Mnemosyne OS. Your memory. Your machine. Your rules." />

**Product** [mnemosyne-os.io](https://mnemosyne-os.io) · **Company, press and labs** [mnemosyne-os.com](https://mnemosyne-os.com) · **Documentation** [docs.mnemosyne-os.io](https://docs.mnemosyne-os.io)

</div>

# @mnemosyne_os/cartridge-sdk

Official Cartridge SDK for **Mnemosyne OS**. It is the secure `postMessage` bridge
for sandboxed in-app cartridges (iframe widgets rendered inside the Infinity
Edition canvas).

This is **the one canonical `MnemoCartridgeSDK`**. In-repo cartridges re-export
it (`export * from '@mnemosyne_os/cartridge-sdk'`); a drift test fails loudly
on any copy that reimplements the transport.

> Building an **external process** (own window, WebSocket `:7799`) instead of
> an in-app cartridge? Use [`@mnemosyne_os/sdk`](https://www.npmjs.com/package/@mnemosyne_os/sdk).
> Routing guide: the "What you can build" table of [`llms.txt`](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS/blob/main/llms.txt).

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

// 1. Own sandbox vault, isolated until the HUMAN unlocks permanence.
const sb = await sdk.ensureSandbox();          // → { vault: 'APP-…', unlocked }

// 2. Declare your vault tile. The host computes the numbers, even app-closed.
await sdk.describeVaultTile({
  icon: '🏝️',
  metrics: [{ label: 'Contacts', spine: 'SOCIAL_CONTACT' }],
});

// 3. Write into YOUR vault (SHA-256 dedup host-side).
await sdk.socialIngest(sb.vault, 'Contact: Léa. …', 'SOCIAL_CONTACT');
```

Every call goes through `invoke(action, payload?, timeoutMs?)`, where an action
whitelisted by the host registry ([`llms.txt`](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS/blob/main/llms.txt) at the root of the public repo lists them all).
Unknown/denied actions reject immediately (the host replies to every request);
outside a host iframe, calls reject immediately too. The default timeout is
5 minutes and is deliberately human-paced: the FIRST call of a permission-gated
action can open the host's native authorization dialog and wait for the human's
click. A short bound would race them and boot the cartridge into a dead
session. Use `timeoutMs: 0` only for user-paced OS dialogs (file pickers).

## Streaming a response token by token

`invoke()` returns one buffered reply. When the host action produces output
incrementally, like a chat turn or a long generation, `stream()` delivers it as it
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
  your callback is swallowed, so one bad render can't break the stream.
- The Promise **resolves** on `MNEMO_PLUGIN_DONE` with `{ text, data? }`.
- An upstream failure **rejects** (`MNEMO_PLUGIN_ERROR`). It NEVER arrives as a
  short-but-complete answer. A truncated stream is an error you can show, not a
  silent lie. Keep whatever `text` you accumulated and mark it interrupted.
- **Cancellation**: abort the `signal`, on tab close or unmount for instance, and the SDK
  tells the host to stop the upstream work and rejects with an `AbortError`.
  Always wire this in a React `useEffect` cleanup so a closed panel stops
  spending.
- **Timeout** here is an *inactivity* window (default 180 s, reset on every
  chunk), not an absolute cap. A legitimately long, tool-running agent turn
  stays alive while a genuinely dead bridge still settles.

Any whitelisted action is stream-consumable: one that doesn't emit chunks
simply resolves via `DONE` with no `onChunk` calls, so `stream()` is a safe
superset of `invoke()` for actions that *might* stream.

## Inheriting the host's look (design tokens)

The OS broadcasts its live design tokens, every CSS variable of the active
theme, computed, the user's custom accent included, into your iframe on load
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

Keep hex fallbacks in your CSS (`var(--accent, #7c4dff)`). They are what
renders when the app runs outside the OS (plain `vite dev`). To observe without
applying, `onHostConfig(cfg => …, { apply: false })`; it returns an
unsubscribe. `applyDesignTokens(tokens)` is exported for manual control.

## Lowering your sound while the voice assistant listens

If your app plays sound, the voice assistant's microphone hears it. The OS
says when the assistant is listening or speaking, so you can turn your sound
down and bring it back after:

```ts
import { onOrbState } from '@mnemosyne_os/cartridge-sdk';

onOrbState(({ active }) => setDucked(active));
```

The same value can arrive twice: treat it as a level. The OS releases it on
its own after two minutes without news, so your app is never left quiet.

## Letting an agent drive your app

An agent can call actions in your app while it is open. The voice assistant
uses the same door when the person speaks to it. Declare each action in
`mnemo-plugin.json`:

```json
"agentActions": [{
  "id": "flyTo",
  "summary": "Fly the camera to a place",
  "effect": "write",
  "params": {
    "query": { "type": "string", "description": "A place name", "maxLength": 120 }
  },
  "required": ["query"]
}]
```

`effect` is `read`, `write` or `spend`. The person grants `spend` separately,
because it uses their credits. The host checks the arguments before your
handler runs.

Then serve the actions from your app:

```ts
sdk.onAgentActions({
  flyTo: async ({ query }) => {
    const res = await flyTo(String(query));
    if (!res.ok) throw new Error(res.reason);
    return { arrived: true };
  },
});
```

Throw to report a failure. The host reports a returned value as done.

Keep each summary and description under 300 characters. The host refuses the
whole list when one declaration is invalid.

The voice assistant reads a `say` field from your result aloud, word for word.
Write it in the person's language.

### Which agents can call them

The voice assistant calls them directly. An external agent calls them through
the actions MCP server that ships inside the Mnemosyne OS app (Mnemosyne OS
1.9.0 or later). That server is not published on npm. Its `os_find` tool lists
the actions of the installed apps that match a request, and `os_run` with
`cartridge.run` calls one. A Hermes install managed by the app is connected to
it automatically.

The public [`@mnemosyne_os/mcp`](https://www.npmjs.com/package/@mnemosyne_os/mcp)
server does not expose cartridge actions. An agent connected only to it cannot
call them.

## Taking spoken sentences

The person can talk to the voice assistant while your app is open. List the
sentences your app takes in `mnemo-plugin.json`, one list per language:

```json
"voiceCommands": {
  "en": ["start the timer", "stop the timer", "show today's hours"],
  "fr": ["lance le chrono", "arrête le chrono", "montre les heures du jour"]
}
```

Write each sentence without the assistant's name. Beside your open window, the
OS shows a card with your sentences. It puts the name the person gave their
assistant in front of each one. The card uses the person's language, else
English. It shows your first 10 sentences, each cut at 120 characters.

The assistant also routes on these sentences. When your app is open and a
sentence starts with the same two words as one of yours, the sentence goes to
your app first. Small words such as "the", "my" or "a" are skipped. So "stop
the timer for Northwind" reaches your app. "Pause the timer" does not, because
no sentence of yours starts with "pause timer". Declare each way people say
it. Each sentence needs two words that count, so "stop" alone routes nothing.

A fast model then reads your `agentActions` and picks the steps. When the model
finds no step, the sentence goes back to the assistant's usual answer, most
often the chat. That answer can sound like the action happened, but your
handlers were never called.

Two more fields help the assistant pick the right action:

- `agentGuide` tells every agent how to drive your app, in your words. The
  voice assistant receives it with your actions, and so does any agent
  connected to the actions MCP server described above. It
  is a string or a list of lines, at most 1,500 characters. The host skips a
  longer guide and keeps your actions.
- `voiceVocabulary` lists the words of your app that speech recognition gets
  wrong, such as client or project names. One list per language, at most 80
  words of 40 characters each. The OS uses them to fix a sentence that is
  already going to your app.

```json
"agentGuide": [
  "One timer runs at a time.",
  "stopTimer stops the running timer and saves the entry."
],
"voiceVocabulary": { "en": ["Northwind", "Contoso"] }
```

Needs Mnemosyne OS 1.9.0 or later.

### When a spoken sentence does nothing

The OS logs each step in one file per day. The date in the name is in UTC.

- Windows: `%LOCALAPPDATA%\Mnemosyne OS\logs\main-YYYY-MM-DD.log`
- macOS: `~/Library/Caches/Mnemosyne OS/logs/main-YYYY-MM-DD.log`
- Linux: `~/.cache/mnemosyne-os/logs/main-YYYY-MM-DD.log`

Search the file for these lines:

1. `[voice-commands]` lists the open apps and how many sentences the OS read
   for each one, for example `en @you/your-app:3`. A `0` means the OS found no
   sentence of yours in that language or in English.
2. `[voice] routed as` tells where the sentence went. A `[voice] drive` line
   after it means the sentence reached the apps. Without one, the chat or the
   local agent answered it.
3. `[ORB-DRIVE]` shows the sentence, the result, the apps and the steps, for
   example `→ ok … steps=stopTimer`. A step without a mark ran: your handler
   was called and returned. A `✗` after an action name is a refusal, with its
   reason. `NO_STEPS` means the model found no step, and the sentence went
   back to the assistant's usual answer. `(recipe)` means the OS replayed a
   plan that worked before for the same words, without the model.

## Your version, and its updates

The OS tells your open app which version is installed. It also says whether a
newer one is published. Both arrive in the same `onHostConfig` message as the
theme. The OS checks the way its Hub does, at most once a day, so your app does
not fetch its own manifest from GitHub.

```ts
import { MnemoCartridgeSDK, onHostConfig } from '@mnemosyne_os/cartridge-sdk';

const sdk = new MnemoCartridgeSDK('@you/your-app');

onHostConfig((cfg) => {
  showBadge(cfg.version);                    // the installed version
  if (cfg.update?.state === 'newer') {
    showLine(cfg.update.latestVersion, cfg.update.critical === true);
  }
});

// Opens the Mnemosyne Hub on your app's page, where the update is offered.
// It installs nothing. opened is false when no Hub answered.
const { opened } = await sdk.showUpdateInHub();
```

`update.state` is `newer`, `current` or `unknown`. Show nothing extra for
`unknown`, and never "up to date": the check may not have happened. A copy in
development receives `version` and no `update`. Needs Mnemosyne OS with doc 142
support; an older host sends neither field.

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
`sdk.scanTree()`. Filter out `manifest.appSandbox` entries, they are other
cartridges' walled-off stores, not the user's memory.

## Telling the user what it cost

```ts
const before = (await sdk.creditsStatus()).data?.usedUsdMicro;
await sdk.inferModel({ prompt });
const after  = (await sdk.creditsStatus()).data?.usedUsdMicro;
```

The delta is the amount **actually billed**, not an estimate. Only the Mnemosyne OS
Cloud route is metered: local inference costs nothing, and a personal API key is
billed by the provider, which the host never sees. Those two are different
statements. Say which one applies instead of displaying a misleading `0`.

## Taking the hand gestures

A cartridge with its own space, such as a 3D model, a map or an image you
zoom, can take the hand gestures of Mnemosyne OS. Declare them in
`mnemo-plugin.json`:

```json
"permissions": ["gesture:receive"],
"gestures": { "takes": ["orbit", "depth", "zoom", "recenter"] }
```

Then subscribe:

```ts
const sub = sdk.onGestures({
  orbit: ({ dx, dy }) => model.rotate(dx, dy),  // pinch and move
  depth: ({ factor }) => camera.dolly(factor),  // hand toward the camera: > 1
  zoom: ({ factor }) => camera.zoom(factor),    // two hands
  recenter: () => camera.reset(),               // open hands held still
  point: ({ x, y }) => highlightAt(x, y),       // the index aims; null when it leaves
  select: ({ x, y }) => openAt(x, y),           // pinch and hold on a point
  next: () => showNext(),                       // open hand swiped
  prev: () => showPrevious(),
});
sub.ready.catch((err) => showWhy(err.message));
// on unmount: sub.off();
```

Your app can also declare its own actions, for things no standard gesture
covers:

```json
"gestures": {
  "takes": ["orbit"],
  "actions": [{ "id": "explode", "label": { "en": "Exploded view", "fr": "Vue éclatée" } }]
}
```

Each action appears in the person's « My gestures » under your app's name.
The person teaches the pose there. You receive it on the `action` handler:
`action: ({ id }) => { if (id === 'explode') model.explode(); }`.

The host asks the person once for `gesture:receive`. Your cartridge
receives intentions, such as « turn by 12 px ». It never sees the camera
or the hand. Gestures arrive while your window is in full screen. `point` and `select` come in your page's own
pixels, so `document.elementFromPoint(x, y)` finds what was aimed. While your
app takes `next` and `prev`, a swipe goes to you instead of switching the
desktop. Moving a
window by its corner, full screen, close and the pad stay with the OS.

## Deleting what you created

Two different things, and your UI must not blur them:

```ts
await sdk.forgetSandbox([12, 13]);          // rows YOU wrote in YOUR sandbox, irreversible
await sdk.deleteProjectDir('C:\\…\\my-app'); // the folder on disk, no trash can
```

`deleteProjectDir` is fenced host-side: home-scoped, never the home root nor a
direct child of it, and the folder must carry a project manifest
(`app-spec.json` / `mnemo-plugin.json` / `BRIEF.md`) or the host answers
`NOT_A_PROJECT`. Collect the human's explicit confirmation first, because the host will
not ask on your behalf.

## Security model

- The iframe is sandboxed: no window globals, no Node/Electron access.
- Replies are accepted from `window.parent` only, targeted to the host origin.
- Your app id is bound host-side (trusted `pluginId`): sandbox operations can
  only ever reach **your own** vault.
- Sandbox vaults are walled off (no federated RAG, no neural map, no Dream
  State) until the human unlocks permanence in the Vault Manager. Your app
  cannot unlock it, and neither can an agent.
- **Synaptic P2P.** The owner may GIVE your vault to a contact to read (nothing
  is written on your side; no declaration needed). Your vault may become a
  SHARED COPY between people only if your manifest says so:
  `"p2p": { "acceptsSharedFiles": true }` lets other members' `.md`/`.txt` files
  will then land in the folder you watch, files you did not write (and
  `name (Alice).md` copies after a conflict). Absent means `false`: the host
  refuses the vault as a shared copy, by name. Declared, never deduced.

---

## The OS your code talks to

<img src="https://raw.githubusercontent.com/Mnemosyne-OS/Mnemosyne-Neural-OS/main/assets/infinite-canvas.jpg" width="100%" alt="Mnemosyne OS Infinity Edition: the infinite canvas, the image gallery, MnemoHub and the living memory" />

*Mnemosyne OS Infinity Edition · [download](https://mnemosyne-os.io/download) · [mnemosyne-os.io](https://mnemosyne-os.io) · [mnemosyne-os.com](https://mnemosyne-os.com)*

---

## The `@mnemosyne_os` packages

All of them live under one npm organization:
**[npmjs.com/org/mnemosyne_os](https://www.npmjs.com/org/mnemosyne_os)**

| Package | What it is |
|---|---|
| [`@mnemosyne_os/sdk`](https://www.npmjs.com/package/@mnemosyne_os/sdk) | Build a **Layer 2 app**: a Node or browser process talking to the local WebSocket surface |
| [`@mnemosyne_os/create-app`](https://www.npmjs.com/package/@mnemosyne_os/create-app) | `npm create @mnemosyne_os/app` scaffolds that Layer 2 app in one command |
| **`@mnemosyne_os/cartridge-sdk`** *(you are here)* | Build an **in-app cartridge**: a sandboxed iframe widget rendered on the canvas |
| [`@mnemosyne_os/mcp`](https://www.npmjs.com/package/@mnemosyne_os/mcp) | **MCP server**: plug Claude, Cursor or any MCP agent into the vaults |
| [`@mnemosyne_os/design-sdk`](https://www.npmjs.com/package/@mnemosyne_os/design-sdk) | **Skin the OS** with JSON alone, no TypeScript |
| [`@mnemosyne_os/public-contracts`](https://www.npmjs.com/package/@mnemosyne_os/public-contracts) | The shared **types and Zod schemas**. No business logic |
| [`@mnemosyne_os/agent-transcripts`](https://www.npmjs.com/package/@mnemosyne_os/agent-transcripts) | Read what **coding agents already write on disk**: the connector format and the interpreter |
| [`@mnemosyne_os/affine-reader`](https://www.npmjs.com/package/@mnemosyne_os/affine-reader) | Read a local **AFFiNE workspace** and render its documents to Markdown |
| [`@mnemosyne_os/forge`](https://www.npmjs.com/package/@mnemosyne_os/forge) | **CLI**: scaffold, list chronicles, import and export |
| [`@mnemosyne_os/sync`](https://www.npmjs.com/package/@mnemosyne_os/sync) | The name of the **P2P layer to come**. A placeholder today, not the library |

---

## Where Mnemosyne OS lives

Published by XPACEGEMS LLC. Its official addresses:

- Product site: <https://mnemosyne-os.io>
- Organizations: <https://mnemosyne-os.com>
- Documentation: <https://docs.mnemosyne-os.io>
- Source: <https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS>
- Packages: <https://www.npmjs.com/org/mnemosyne_os>
