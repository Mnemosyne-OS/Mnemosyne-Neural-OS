# Building a Mnemosyne OS cartridge — agent reference

> For an AI coding agent (Cursor, Claude Code, Copilot, Antigravity, …). Read this
> **fully** before writing code. It is the authoritative build surface — **do not
> guess APIs or invent actions.** If a capability is not listed here or in the
> linked docs, it does not exist. Follow the reference implementation's patterns;
> do not improvise.

## 0. Pick the right surface first (they are NOT interchangeable)

Mnemosyne OS exposes three ways to build on it. Choose before writing a line.

| You are building… | Surface | Client library | Transport |
|---|---|---|---|
| A **UI panel inside the Mnemosyne window** (a cartridge on MnemoHub) | **Cartridge** — *this guide* | `MnemoCartridgeSDK` (`@mnemosyne_os/cartridge-sdk`) | `postMessage`, sandboxed iframe |
| A **separate program** (Node service, agent, standalone web/desktop app) that talks to the user's memory | **Layer 2 app** | `@mnemosyne_os/sdk` | WebSocket `ws://127.0.0.1:7799` |
| Letting **an external AI assistant** read/write the vault | **MCP server** | `@mnemosyne_os/mcp` | MCP → 7799 |

Rendering pixels *inside* Mnemosyne → **Cartridge**. A *separate process* → Layer 2 app. An *AI assistant caller* → MCP.

> ⚠️ `MnemoCartridgeSDK` is **not** `@mnemosyne_os/sdk`. Never `npm install
> @mnemosyne_os/sdk` in a cartridge — that is a different surface (Layer 2, §5).

## 1. Cartridge quickstart

Never start from a blank page:

- **Scaffold:** copy this boilerplate (`examples/cartridge-boilerplate`, the folder this file lives in). ⛔ Not `npm create @mnemosyne_os/app`: that scaffolds a Layer 2 app (a separate process, no `mnemo-plugin.json`), and MnemoHub refuses to link it.
- **Reference implementation to read first:** [MnemoReader](https://github.com/Mnemosyne-OS/MnemoReader---MnemosyneOS) (a real, shipped cartridge). Match its patterns.

A cartridge is a React/Vite web app loaded in a **sandboxed iframe** inside the host. It has **no** Node, Electron, filesystem, or network-to-host access. It reaches the host **only** through the SDK's `postMessage` bridge.

### Manifest — `mnemo-plugin.json`

```json
{
  "name": "@you/my-cartridge",
  "displayName": "My Cartridge",
  "version": "0.1.0",
  "permissions": ["vault:read", "model:infer"],
  "entrypoints": { "renderer": "index.html" },
  "widgets": []
}
```

- `name` — must match the id you pass to the SDK (below).
- `permissions[]` — declare **only** what you call (§2). The user grants them at install.
- `entrypoints.renderer` — a **relative** path (`index.html`) in the manifest you **publish**. This boilerplate's own `mnemo-plugin.json` points at `http://localhost:5185/index.html` so that the dev server works while you build; the store preflight rejects that URL, so swap it to `index.html` before you submit.

### Client

```ts
import { MnemoCartridgeSDK } from './sdk/mnemo-sdk'; // re-exports @mnemosyne_os/cartridge-sdk
const sdk = new MnemoCartridgeSDK('@you/my-cartridge'); // must equal manifest "name"
const text = await sdk.invoke('model.infer', { prompt: 'Summarize my week.' });
```

Every host call is `await sdk.invoke('<action>', payload)`. The complete, authoritative action list is §3.

## 2. Permissions (fine-grained access control)

Permissions are declared in the manifest and granted by the user at install. Each action's required permission is the middle column of the §3 table. Vocabulary:

`vault:read` · `vault:write` · `model:infer` · `dialog:open` · `metrics:read` · `settings:read` · `settings:write` · `scout:run` · `wallet:read` · `net:lan` · `watch:background` · `hermes:control` · `cockpit:pin` · `agent:export` · `git:read` · `breach:lookup` · `agenda:write` · `feedback:send` · `gesture:receive` · `vulns:mirror` · `marks:registry` · `marks:mirror` · `license:admin` · `image:generate` · `video:generate` · `site:publish`

- Request the **minimum**. Over-declaring gets a cartridge rejected at review.
- `license:admin` is founder-only — you will not have it; do not build against it.
- The permissions explained here are narrow and rarely what you want. `wallet:read` reads a
  credit balance, `net:lan` reads one device on the user's own network,
  `watch:background` lets the host keep polling your feeds while your window
  is closed, `hermes:control` drives a local agent install, `cockpit:pin`
  lets the user pin small status cards you publish (`cockpit.*`) on their
  canvas — presence on the shell, never a read — and `agent:export` writes ONE
  agent session out as a readable document, in that session's own folder beside
  the transcript it came from; it is deliberately not part of `dialog:open`.
  `vulns:mirror` downloads the public OSV vulnerability database (~200 MB, the
  size shown first) into the app's own cache folder and reads it back by
  package name (MnemoVulns). `marks:registry` keeps the keys a person gets from
  trademark offices sealed in the host (the cartridge can store and check one,
  never read it back); `marks:mirror` downloads public trademark registers
  (~440 MB for IP Australia, the size shown first) into the app's own cache
  folder and searches them by name (MnemoMarks). `agenda:write` adds appointments to the
  host calendar (`agenda.add`) so they ring with your window closed; it is
  add-only and never reads, moves or deletes one. `gesture:receive` lets your
  window receive the hand gestures the person makes while it is in full
  screen (`sdk.onGestures`, see below): intentions such as « turn by 12 px »,
  never the camera nor the hand. Declaring one you do not call is
  over-declaring, and it gets a cartridge rejected.
- Some actions are **ungated** (no permission) — they are still listed in §3.

### Hand gestures (`gesture:receive`)

A cartridge with its own space (a 3D model, a map, an image you zoom) can
take the hand gestures of Mnemosyne OS. Declare them in the manifest:

```json
"permissions": ["gesture:receive"],
"gestures": { "takes": ["orbit", "depth", "zoom", "recenter"] }
```

`takes` is a closed list: `orbit` (pinch drag, turn), `pan` (pinch drag,
move), `depth` (the hand toward or away from the camera), `zoom` (two
hands), `recenter` (open hands held still), `point` (the index aims: your
page's px, or null when the aim leaves), `select` (pinch and hold still on a
point; moving first makes it a drag), `next` / `prev` (an open hand swiped;
they replace the desktop switch while your app takes them). `orbit` and
`pan` are the same hand move: take one. `point` and `select` come in your
page's own pixels: `document.elementFromPoint(x, y)` finds what was aimed.
Then, in your code:

```ts
const sub = sdk.onGestures({
  orbit: ({ dx, dy }) => model.rotate(dx, dy),
  depth: ({ factor }) => camera.dolly(factor), // > 1 = closer
  recenter: () => camera.reset(),
});
sub.ready.catch((err) => showWhy(err.message)); // refused, or no host
// on unmount: sub.off();
```

Your app can also declare its own actions, for what no standard gesture
covers: `"actions": [{ "id": "explode", "label": { "en": "Exploded view" } }]`
inside `gestures` (id a-z0-9-, up to 32; up to 8 actions; a label per
language). Each one appears in the person's « My gestures » under your app's
name; the person teaches the pose, and you receive `{ kind: 'action', id }`
on the `action` handler. You never choose the pose.

Gestures arrive only while your window is in full screen. The OS gestures
(move a window by its corner, full screen, close, the pad) stay with the
OS. The example is `src/GestureCube.tsx` in this boilerplate.

## 3. Action reference — the only actions that exist

`await sdk.invoke(action, payload)`. This table is generated from the host registry and guarded by a drift test — it cannot lie or lag.

<!-- GENERATED:CARTRIDGE-ACTIONS:START -->
_299 actions. Generated by `pnpm actions` — do not edit by hand._

| Action | Permission | What it does | Source |
|---|---|---|---|
| `agenda.add` | `agenda:write` | A cartridge puts an appointment in the host calendar, so it rings on the canvas even with the cartridge closed (doc 124 §3.3). Its own permission: it WRITES int | `pluginBridgeHandlers.ts` |
| `agent.exportConversation` | `agent:export` | The only cockpit-family action that writes to the disk, so it carries its own permission instead of riding `cockpit:pin` — which is about presence on the canvas | `pluginBridgeHandlers.ts` |
| `agent.keepConversations` | `vault:write` | Keeps up to 50 agent sessions (`items` of { transcript, title? }) as Markdown in a vault that watches .md (`workspaceId`). | `pluginBridgeHandlers.ts` |
| `agent.keepDestinations` | `vault:read` | Keep agent sessions in memory (doc 132 lot 1). The list rides `vault:read` (it names vaults, like `mnemosyne.status`); the keep rides `vault:write`, because wri | `pluginBridgeHandlers.ts` |
| `agent.keepRuleRevoke` | `vault:write` | Removes a standing rule by `id`. What it already kept stays in the vault. | `pluginBridgeHandlers.ts` |
| `agent.keepRuleRun` | `vault:write` | Runs every standing rule now, not only this cartridge's, and answers when the pass is done (TIMEOUT after 5 minutes). | `pluginBridgeHandlers.ts` |
| `agent.keepRules` | `vault:read` | The standing rule (doc 132 lot 2). Asking for one rides `vault:write`, but only a yes in the HOST's native dialog creates it: a cartridge alone never sets a rul | `pluginBridgeHandlers.ts` |
| `agent.keepRuleSet` | `vault:write` | Asks for a rule that keeps a project's sessions (`projectDir`) in a vault. Only the human's yes in the host's own dialog creates it. | `pluginBridgeHandlers.ts` |
| `app.clone` | `dialog:open` | One-click clone of a GitHub repo into the user's app space, after the cartridge collected explicit user consent in its own UI. The main-side handler (dialog:clo | `pluginCartridgeActions.ts` |
| `breach.keyState` | `breach:lookup` | Breach Watch (doc 141 §4): whether the person's own HIBP key is stored, when and how it is sealed. Never the key: there is no action that returns it. | `pluginCartridgeActions.ts` |
| `breach.lookup` | `breach:lookup` | Which known breaches one email is in, sent to Have I Been Pwned with the person's key. Main refuses (NOT_DECLARED) any email this cartridge did not save in its  | `pluginCartridgeActions.ts` |
| `breach.removeKey` | `breach:lookup` | Deletes the sealed key file. | `pluginCartridgeActions.ts` |
| `breach.setKey` | `breach:lookup` | The key, typed once in the cartridge and sealed in main. Rejects with EMPTY · HAS_WHITESPACE · LOOKS_LIKE_URL · SEAL_REFUSED. | `pluginCartridgeActions.ts` |
| `browseModelFile` | `dialog:open` | Opens the OS file picker filtered to model files (.gguf, .onnx, .bin). Returns { success, path }; success is false when cancelled. | `pluginBridgeHandlers.ts` |
| `cancelDownload` | `model:infer` | Cancels the download of a Dev Edition catalog id. Always answers { success: true }, an unknown id included. | `pluginBridgeHandlers.ts` |
| `canvas.leaveBoard` | _(none)_ | Back from a cartridge's board to the desktop its board was opened from (this session). Same gesture rule and the same throttle as opening: switching the board i | `pluginCartridgeActions.ts` |
| `canvas.openBoard` | _(none)_ | A cartridge lays its OWN declared windows out on ITS OWN desktop (named after it, found or created empty) and the camera frames them: MnemoClio's exploded view. | `pluginCartridgeActions.ts` |
| `catalog.get` | `license:admin` | Signed store catalog (public data) — lets the triage view flag a submission whose appId is ALREADY LIVE as an update of that entry, with the live version next t | `pluginBridgeHandlers.ts` |
| `catalog.syncVersions` | `license:admin` | Founder-only: re-sign the live catalog with the versions the standalone repos serve at HEAD — what installs actually pull. Version fields of already-listed apps | `pluginBridgeHandlers.ts` |
| `cockpit.pin` | `cockpit:pin` | Pin one card (a human gesture in the cartridge). `card` may carry the card itself so it appears in the same frame; `level` defaults to 'hud'. | `pluginBridgeHandlers.ts` |
| `cockpit.publish` | `cockpit:pin` | Cockpit (doc 110): small status cards a module publishes about something alive elsewhere (an agent session, a job), which the human pins on the canvas — on scre | `pluginBridgeHandlers.ts` |
| `cockpit.state` | _(none)_ | Which of THIS cartridge's card ids are pinned. Ungated on purpose: it reads only what the cartridge itself published, and a cartridge must be able to ask at boo | `pluginBridgeHandlers.ts` |
| `cockpit.unpin` | `cockpit:pin` | Unpins one of THIS cartridge's cards by `id`. Returns the ids still pinned. | `pluginBridgeHandlers.ts` |
| `conversation.delete` | `vault:write` | C9 (accepted by Tony 2026-09-05): a `vault:write` cartridge may delete or vectorize ANY of the human's conversations, not only its own. The manifest scope is th | `pluginBridgeHandlers.ts` |
| `conversation.get` | `vault:read` | One conversation in full, messages included, by `id` (any of the human's). null when missing or unreadable. | `pluginBridgeHandlers.ts` |
| `conversation.list` | `vault:read` | Metadata of ALL the human's conversations (id, title, dates, message count, vault, pinned, kind). Messages are not included. | `pluginBridgeHandlers.ts` |
| `conversation.save` | `vault:write` | Creates or overwrites a conversation file by its id, any of the human's included. Validated first; keeps the original createdAt. | `pluginBridgeHandlers.ts` |
| `conversation.vectorize` | `vault:write` | Embeds a conversation (`convId`) as one SESSION chronicle in `vaultId` (QUANTUM or empty means DEV), replacing its last one. | `pluginBridgeHandlers.ts` |
| `credits.admin.grant` | `license:admin` | Founders only. Adds micro-USD to a wallet's sponsored credit on the gate (enrols it if new). Checked against the pool, audited. | `pluginBridgeHandlers.ts` |
| `credits.admin.list` | `license:admin` | Same trust model as submission review: every call is signed with the sovereign wallet in main and the gate enforces VALIDATOR_WALLETS. | `pluginBridgeHandlers.ts` |
| `credits.admin.remove` | `license:admin` | Founders only. Deletes a wallet's credit account, spent counter and usage log on the gate, for good. Audited. | `pluginBridgeHandlers.ts` |
| `credits.admin.update` | `license:admin` | Founders only. Changes a wallet's credit status, note, license offer or discount, or SETS its budget (not added, no pool check). | `pluginBridgeHandlers.ts` |
| `credits.admin.usage` | `license:admin` | Founders only. One wallet's credit account, amount used and usage entries, read from the gate. | `pluginBridgeHandlers.ts` |
| `credits.audit.list` | `license:admin` | Founder action audit trail (Activity log panel). | `pluginBridgeHandlers.ts` |
| `credits.balance` | `wallet:read` | Remaining cloud credits, so a cartridge can show what the user has BEFORE spending it. Read-only aggregate: a number and a timestamp, never the wallet address,  | `pluginBridgeHandlers.ts` |
| `credits.purchases.backfill` | `license:admin` | Rebuild the ledger from Stripe's archive (sales predating the ledger). Bookkeeping only — it grants no credit and mints nothing. | `pluginBridgeHandlers.ts` |
| `credits.purchases.list` | `license:admin` | Stripe sales ledger — credit AND license purchases. Read-only: the console reports money that already moved, it can never make money move. | `pluginBridgeHandlers.ts` |
| `credits.requests.list` | `license:admin` | Pending credit requests (users asking the founder for credits) — same license:admin gate; the server re-checks VALIDATOR_WALLETS fail-closed. | `pluginBridgeHandlers.ts` |
| `credits.requests.resolve` | `license:admin` | Founders only. Approves a credit request (grants the amount, pool-checked) or refuses it. Either way it leaves the queue. | `pluginBridgeHandlers.ts` |
| `credits.status` | `metrics:read` | The USER's own credit balance — read-only, their own wallet, nothing about anyone else (the founder-side ledgers stay behind license:admin). A creation cartridg | `pluginCartridgeActions.ts` |
| `dialog.deleteFile` | `dialog:open` | Single-file delete, home-scoped and file-only host-side (dialog:deleteFile refuses directories). Cartridges use it for their own artifacts — e.g. BMAD deleting  | `pluginBridgeHandlers.ts` |
| `dialog.deleteProjectDir` | `dialog:open` | Delete a project FOLDER a creation cartridge scaffolded — the destructive half of "delete my project, files included". The generic host-side dialog.deleteDirect | `pluginCartridgeActions.ts` |
| `dialog.mkdir` | `dialog:open` | Creates a folder, parents included. Refused outside the user's home and the knowledge folder. | `pluginBridgeHandlers.ts` |
| `dialog.openInOS` | `dialog:open` | Opens a file natively in the OS default application (whitelisted extensions). | `pluginBridgeHandlers.ts` |
| `dialog.readDir` | `dialog:open` | Lists directory entries for a given path. | `pluginBridgeHandlers.ts` |
| `dialog.readFile` | `dialog:open` | Reads a file's content from an absolute path (home-scoped host-side). | `pluginBridgeHandlers.ts` |
| `dialog.selectFile` | `dialog:open` | Opens the OS file picker (user-paced — no timeout). | `pluginBridgeHandlers.ts` |
| `dialog.selectFolder` | `dialog:open` | `startIn` is a HOME-RELATIVE hint: it decides where the picker opens, and is resolved main-side. The cartridge never receives a path from it — only what the hum | `pluginBridgeHandlers.ts` |
| `dialog.writeFile` | `dialog:open` | Writes content to an absolute path (home-scoped host-side). | `pluginBridgeHandlers.ts` |
| `downloadModel` | `model:infer` | Starts downloading the host model that a Dev Edition catalog id maps to. An unknown id is refused. | `pluginBridgeHandlers.ts` |
| `feedback.broadcast.list` | `license:admin` | Announcements to every install (doc 101 §15): main signs the words in every language; the gate checks that signer is the validator who authenticated. Read back  | `pluginBridgeHandlers.ts` |
| `feedback.broadcast.publish` | `license:admin` | Publish to every install; main signs the words in every language. | `pluginBridgeHandlers.ts` |
| `feedback.broadcast.retract` | `license:admin` | Withdraw one; it leaves every install at their next look. | `pluginBridgeHandlers.ts` |
| `feedback.delete` | `license:admin` | Founders only. Deletes one feedback message from the gate, for good. | `pluginBridgeHandlers.ts` |
| `feedback.export` | `license:admin` | Hand a bug report to the agent that will fix it: main writes the queue to a file and answers with the path. The console passes a FILTER and nothing else — no ro | `pluginBridgeHandlers.ts` |
| `feedback.list` | `license:admin` | What people wrote about the app: the avis and the bug reports (doc 101). Same license:admin gate as the other console rails; the gate re-checks VALIDATOR_WALLET | `pluginBridgeHandlers.ts` |
| `feedback.reply` | `license:admin` | Answer under a row (doc 101 §14). Main signs the WORDS with the sovereign wallet; the gate checks that signer is the validator who authenticated and that the au | `pluginBridgeHandlers.ts` |
| `feedback.requestCountry` | `feedback:send` | "Add my country" from a cartridge (doc 134 lot 5). The cartridge hands one ISO country code and nothing else: the host checks it and writes the words itself, so | `pluginCartridgeActions.ts` |
| `feedback.resolve` | `license:admin` | Founders only. Marks a feedback message read, which archives it on the gate. Past 2,000 archived rows, the oldest is deleted. | `pluginBridgeHandlers.ts` |
| `getActiveEmbedModel` | `model:infer` | The active primary embedding model as a Dev Edition catalog id, and whether its file is installed (local models only). | `pluginBridgeHandlers.ts` |
| `getGlobalConfig` | `settings:read` | { geminiApiKey, modelStrategy, activeLocalModel }. `geminiApiKey` is the LIVE cloud API key, handed over on purpose. | `pluginBridgeHandlers.ts` |
| `getStatus` | _(none)_ | { vaultReady (a workspace exists), systemReady (always true), platform, capabilities }: what a cartridge may ask of this host. | `pluginBridgeHandlers.ts` |
| `getSystemMetrics` | `metrics:read` | Machine metrics for a dashboard: CPU %, RAM %, used/total RAM in GB, GPU load (null when unmeasured). `rssMb` is the machine's used RAM, not the app's. | `pluginBridgeHandlers.ts` |
| `getTopologyMap` | `vault:read` | Topology map of memory resonances (Neural Map data). | `pluginBridgeHandlers.ts` |
| `getWatchedFolders` | `vault:read` | Meant to list every enabled DocWatch folder. Known defect: it reads fields the vault tree no longer has, so the list is always empty. | `pluginBridgeHandlers.ts` |
| `git.declareRepo` | `git:read` | The history of a repository the HUMAN declared (doc 140 §7). The folder is picked in main's native dialog, and every call names it by an id from THIS cartridge' | `pluginCartridgeActions.ts` |
| `git.forgetRepo` | `git:read` | Forgets one of this cartridge's declared repositories (`repoId`). The repository itself is untouched. | `pluginCartridgeActions.ts` |
| `git.log` | `git:read` | Commits of a repository this cartridge declared (`repoId`): dates, authors, subjects, file names, up to 1,000 a page, and the total. | `pluginCartridgeActions.ts` |
| `git.repos` | `git:read` | This cartridge's declared repositories (id, folder name, addedAt, missing). Never their paths. | `pluginCartridgeActions.ts` |
| `github.token.clear` | `license:admin` | Founders only. Deletes the sealed GitHub token file. | `pluginBridgeHandlers.ts` |
| `github.token.set` | `license:admin` | Founders only. Seals a GitHub token to disk, replacing any. Returns its state, never the token. | `pluginBridgeHandlers.ts` |
| `github.token.state` | `license:admin` | 🚨 There is no `getGithubToken` here, and there never will be: the console can learn THAT a token exists and how it is sealed, never what it is. | `pluginBridgeHandlers.ts` |
| `hermes.agentProfileCreate` | `hermes:control` | Create a full second agent via `hermes profile create <name>` — their managed layer owns the scaffolding; we never imitate it. | `pluginHermesActions.ts` |
| `hermes.agentProfiles` | `hermes:control` | The agent army: default agent + every Hermes profile with its env facts (telegram token present, api port) and gateway-managed flag. | `pluginHermesActions.ts` |
| `hermes.agentProfileTelegram` | `hermes:control` | Per-profile Telegram keys (validated shapes, backup first). BotFather stays the human's flow — the cockpit guides, takes the token, never pretends to automate T | `pluginHermesActions.ts` |
| `hermes.applyPreset` | `hermes:control` | Apply a one-click security preset on BOTH sides of the bridge: Hermes' config.yaml (toolsets, approvals.mode, security.tirith_*) and the brain proxy's daily cal | `pluginHermesActions.ts` |
| `hermes.channels` | `hermes:control` | Messaging-platform census of the local install (.env prefix heuristic; Telegram's exact documented variables). Read-only. | `pluginHermesActions.ts` |
| `hermes.channelSetTelegram` | `hermes:control` | Write the Telegram bot token / allowed user ids into the install's .env on the human's click — validated shapes only, backup first. | `pluginHermesActions.ts` |
| `hermes.chat` | `hermes:control` | One chat turn with the local Hermes Agent through its api_server. The conversation is caller-supplied and stateless host-side; auth uses the key from Hermes' ow | `pluginHermesActions.ts` |
| `hermes.chatStream` | `hermes:control` | The streaming twin of hermes.chat (first consumer of the sdk.stream primitive): the agent's reply fills the bubble token by token instead of arriving buffered.  | `pluginHermesActions.ts` |
| `hermes.connectorMoliProbe` | `hermes:control` | What answers at the Moli OS address the person typed (GET /api/health on their LAN). "Refused" or "no answer" is a verdict in the data, not a throw; only a malf | `pluginHermesActions.ts` |
| `hermes.connectors` | `hermes:control` | Data connectors (Apify): linked or not — never the key itself. | `pluginHermesActions.ts` |
| `hermes.connectorSetApify` | `hermes:control` | Link Apify with the person's own key (their account, their bill), or unlink it with `token: null`. Shape-checked in main, backup first. | `pluginHermesActions.ts` |
| `hermes.connectorSetMoli` | `hermes:control` | Link Moli OS at an IP address of the person's network (`mcp_servers.moli`, backup first), or unlink it with `address: null`. Checked in main: an IP literal on a | `pluginHermesActions.ts` |
| `hermes.gatewayLogs` | `hermes:control` | The gateway log ring (oldest first) — the honest answer to "I clicked start and nothing happens": the process's own words, crash included. | `pluginHermesActions.ts` |
| `hermes.gatewayStart` | `hermes:control` | Start a Hermes gateway as a child of Mnemosyne — the human's click, zero terminal. profile '' = the default agent; each profile is its own process with its own  | `pluginHermesActions.ts` |
| `hermes.gatewayStop` | `hermes:control` | Stop a cockpit-managed gateway (kills that profile's process tree). | `pluginHermesActions.ts` |
| `hermes.inbox` | `vault:read` | Provenance inbox (doc 58 semantics): list every chronicle the agent wrote through the MCP across active non-MAXIMUM vaults, with the legal move targets. Listing | `pluginHermesActions.ts` |
| `hermes.inboxMove` | `vault:write` | The human relocated it: re-ingest into the target vault, then forget the source (in that order — a failed ingest never loses the chronicle). | `pluginHermesActions.ts` |
| `hermes.inboxReject` | `vault:write` | The human's veto: forget an agent-written chronicle from its vault. | `pluginHermesActions.ts` |
| `hermes.managedInstall` | `hermes:control` | Managed install (doc 123 §4 lot 0): the app fetches the pinned Hermes release, builds its venv on the managed Python and writes the config. One click for every  | `pluginHermesActions.ts` |
| `hermes.managedInstallCancel` | `hermes:control` | Stops the running managed Hermes install. Returns { cancelled }; false means nothing was running. | `pluginHermesActions.ts` |
| `hermes.managedInstallStatus` | `hermes:control` | State of the managed Hermes install: the job, home path, pinned release, marker, launch commands and stt/tts blocks from config.yaml. | `pluginHermesActions.ts` |
| `hermes.openPath` | `hermes:control` | Open a file the agent produced with the OS default application (the same door the notes use for a pdf or a docx): under the user's home, on the host's safe-exte | `pluginHermesActions.ts` |
| `hermes.profileGet` | `hermes:control` | Read the agent's USER.md profile — what Hermes injects into its system prompt to know its human. charLimit is Hermes' own injection budget. | `pluginHermesActions.ts` |
| `hermes.profileSet` | `hermes:control` | Write the reviewed profile (clamped to Hermes' budget, backup first). All three cockpit modes (Mnemosyne pre-fill, questionnaire, import) converge on one human- | `pluginHermesActions.ts` |
| `hermes.proxyApplyAux` | `hermes:control` | Route Hermes' auxiliary tasks (vision, web summaries, compression, titles, session search) to the brain proxy — Hermes' side quests think with the user's OS too | `pluginHermesActions.ts` |
| `hermes.proxyApplyConfig` | `hermes:control` | Write the brain block into the local Hermes install's config.yaml — the human's explicit click in the cockpit, with a timestamped backup first. The covenant for | `pluginHermesActions.ts` |
| `hermes.proxySetConfig` | `hermes:control` | Toggle the brain proxy or adjust its daily call cap (the anti-runaway guard). The toggle is the kill switch — off by default, human-only. | `pluginHermesActions.ts` |
| `hermes.proxyStatus` | `hermes:control` | Brain proxy (doc 81): status of the loopback endpoint serving Mnemosyne's inference to the local agent — includes the Bearer key (only while enabled) for the co | `pluginHermesActions.ts` |
| `hermes.readDocument` | `hermes:control` | Read the head of one text document the agent wrote (md, txt, html, json, csv…) for a preview card: `{ path, name, text, truncated }`, text capped at 20 000 char | `pluginHermesActions.ts` |
| `hermes.readMedia` | `hermes:control` | Read one image the agent produced, by the path its `MEDIA:"<path>"` tag carries, as a data URL the cockpit can draw. Images only (png/jpg/jpeg/gif/ webp/bmp), u | `pluginHermesActions.ts` |
| `hermes.runApprove` | `hermes:control` | Answers a run's pending approval (once, session, always or deny) on the local Hermes gateway. Refuses when nothing is pending. | `pluginHermesActions.ts` |
| `hermes.runList` | `hermes:control` | The Hermes runs this app follows: input, status, pending approval (command redacted), output and log. | `pluginHermesActions.ts` |
| `hermes.runStart` | `hermes:control` | Tasks with approval (doc 123 lot 1): a run on the gateway's /v1/runs, followed in main; the panel polls runList and answers approvals. | `pluginHermesActions.ts` |
| `hermes.runStop` | `hermes:control` | Asks the local Hermes gateway to stop a run this app follows. The run then shows as stopping. | `pluginHermesActions.ts` |
| `hermes.searchApply` | `hermes:control` | Route Hermes' web search to Mnemosyne's own SearXNG — the OS's third engine served to the agent (brain, auxiliaries, now search). The error codes name the exact | `pluginHermesActions.ts` |
| `hermes.searchFreeInstall` | `hermes:control` | The free web search engine (ddgs, no key) into the install's venv. | `pluginHermesActions.ts` |
| `hermes.searchSetBrave` | `hermes:control` | Write or remove the person's own Brave Search key (.env, backup first). | `pluginHermesActions.ts` |
| `hermes.searchStatus` | `hermes:control` | Local SearXNG liveness + whether Hermes already routes search to it. | `pluginHermesActions.ts` |
| `hermes.securityPosture` | `hermes:control` | Current security posture (approvals mode, tirith stance, toolsets shape) matched against the three one-click presets — read-only. | `pluginHermesActions.ts` |
| `hermes.skillImport` | `hermes:control` | OS folder picker, then a copy under skills/custom/<name>. | `pluginHermesActions.ts` |
| `hermes.skillInstall` | `hermes:control` | Install a skill through Hermes' own installer (quarantine + scan + trust level): the covenant skill with no identifier, or the identifier the cockpit's "Advance | `pluginHermesActions.ts` |
| `hermes.skillInstallStatus` | `hermes:control` | The skill install in flight (or the last one): the card polls it for its clock and the installer's lines while the install call is pending. | `pluginHermesActions.ts` |
| `hermes.skills` | `hermes:control` | Read-only shelf of the local Hermes Agent's skills and tap subscriptions. Removing stays a human gesture in its CLI. | `pluginHermesActions.ts` |
| `hermes.skillsOpenFolder` | `hermes:control` | The skills folder, opened in the OS file manager (a person's own skills are folders with a SKILL.md, dropped there). | `pluginHermesActions.ts` |
| `hermes.skillsSetDisabled` | `hermes:control` | The `skills.disabled` list, written whole. | `pluginHermesActions.ts` |
| `hermes.skillUninstall` | `hermes:control` | Remove a hub-installed or imported skill (never a bundled one). | `pluginHermesActions.ts` |
| `hermes.status` | `hermes:control` | Mnemosyne OBSERVES the local Hermes Agent install (Nous Research): status of the install and its api_server config. The inbound arrow — a Hermes agent reading O | `pluginHermesActions.ts` |
| `hermes.toolsets` | `hermes:control` | Per-platform toolsets (config.yaml platform_toolsets) + the vocabulary of individual toolsets, so the cockpit can render a localized editor. | `pluginHermesActions.ts` |
| `hermes.toolsetsSet` | `hermes:control` | Regenerate the platform_toolsets block on the human's click (backup first). The block is a flat map — wholesale regeneration, idempotent. | `pluginHermesActions.ts` |
| `hermes.update` | `hermes:control` | Run `hermes update` as a child of Mnemosyne (repairs the embedded runtime — e.g. the SQLite the gateway warns about). Fire; the panel polls updateStatus. The cl | `pluginHermesActions.ts` |
| `hermes.updateStatus` | `hermes:control` | State of the last `hermes update` run, kept in memory: { running, startedAt, exitCode, output (last 200 lines) }. | `pluginHermesActions.ts` |
| `hermes.voiceRoute` | `hermes:control` | Which voice answers on a channel (doc 123, 2026-09-23): what config.yaml says, and whether the voice chosen in Settings › Voice can be used. | `pluginHermesActions.ts` |
| `hermes.voiceRouteSet` | `hermes:control` | Sets the managed Hermes voice: `edge`, or `app` (Settings › Voice, checked first). Rewrites config.yaml's tts: block, backup kept. | `pluginHermesActions.ts` |
| `hermes.watchAct` | `hermes:control` | Create / remove / pause / resume / run now a watch, or switch keep-awake. Every field is checked again in main; this only shapes the request. | `pluginHermesActions.ts` |
| `hermes.watches` | `hermes:control` | Nightly watches (2026-10-02): Hermes cron jobs narrowed to web search, their runs priced by the proxy's tagged calls, the search engine Hermes will really call, | `pluginHermesActions.ts` |
| `hermes.watchReport` | `hermes:control` | One report's text: the latest, or the file the cockpit names. | `pluginHermesActions.ts` |
| `hub.showUpdate` | _(none)_ | Opens the Mnemosyne Hub on this cartridge's own page, where its update is offered (doc 142 §4.2). Installs nothing; the id is the bridge's, never the payload's. | `pluginCartridgeActions.ts` |
| `image.depth` | `dialog:open` | The relative depth of one picture (absolute path inside the home), on this machine, no credit spent. Answers a NEW grey PNG beside the source (`<name>-depth.png | `pluginStudioActions.ts` |
| `image.depthStatus` | `dialog:open` | Whether the image engine is installed and the depth model is on disk, with the download's size. The install is in Settings > Images. | `pluginStudioActions.ts` |
| `image.generate` | `image:generate` | Draw one picture on the Mnemosyne credit route (never the person's own key). `editImagePath` is a picture to change in place, `refImagePaths` (up to 4) pictures | `pluginStudioActions.ts` |
| `image.removeBackground` | `dialog:open` | Lift the subject of one picture (absolute path inside the home) off its background, on this machine, no credit spent: Theia's matte, the canvas's « Supprimer le | `pluginStudioActions.ts` |
| `image.upscale` | `dialog:open` | Enlarge one picture (absolute path inside the home) by `scale` (1.25 to 4, of its own width), on this machine, no credit spent. Answers the NEW file, written be | `pluginStudioActions.ts` |
| `image.upscaleStatus` | `dialog:open` | Whether the image engine is installed and the upscaler's weights are on disk, with the download's size in bytes. Nothing is downloaded by a cartridge: the insta | `pluginStudioActions.ts` |
| `irinaHealthCheck` | _(none)_ | Fixed placeholder: always answers { success, active: true, latencyMs: 12 }. It checks nothing and measures nothing. | `pluginBridgeHandlers.ts` |
| `lan.fetch` | `net:lan` | Read ONE device on the user's own network (doc 94). The cartridge id comes from the bridge, never the payload, so an app cannot spend another one's grants; main | `pluginCartridgeActions.ts` |
| `lan.grants` | `net:lan` | The doors THIS cartridge holds, so it can show them and explain a refusal. Scoped to the caller: an app learns nothing about what any other was given. | `pluginCartridgeActions.ts` |
| `license.admin.status` | `license:admin` | The airdrop console's own state: owner key stored, 2FA active, session unlocked. | `pluginBridgeHandlers.ts` |
| `license.airdrop` | `license:admin` | Founders only, after unlock. Mints a license NFT to a wallet with the owner key (irreversible), drops its request, seeds $5 credit if new. | `pluginBridgeHandlers.ts` |
| `license.confirmTotp` | `license:admin` | Founders only. Checks a 2FA code against the pending secret and turns 2FA on. Throws on a wrong code. | `pluginBridgeHandlers.ts` |
| `license.offer` | _(none)_ | Open the wallet, where a license is bought or asked for. The cartridge calls it from its own "get a license" button; the host decides what the wallet shows, the | `pluginCartridgeActions.ts` |
| `license.requests.activate` | `license:admin` | Founders only, after unlock. Mints the license to the requesting wallet on-chain (irreversible, no credit), then drops the request. | `pluginBridgeHandlers.ts` |
| `license.requests.dismiss` | `license:admin` | Founders only. Removes a wallet's license request from the gate without minting, a paid one included. | `pluginBridgeHandlers.ts` |
| `license.requests.list` | `license:admin` | License-request queue (users asking the founder for a gifted license). Same license:admin gate; the gate re-checks VALIDATOR_WALLETS fail-closed. `activate` min | `pluginBridgeHandlers.ts` |
| `license.setOwnerKey` | `license:admin` | Founders only. Stores the license contract's OWNER private key, encrypted on this machine, once it derives the on-chain owner. Replaces any. | `pluginBridgeHandlers.ts` |
| `license.setupTotp` | `license:admin` | Founders only. Makes a new 2FA secret, turns 2FA off until confirmed, and RETURNS the raw secret with its otpauth URI. | `pluginBridgeHandlers.ts` |
| `license.status` | _(none)_ | Whether this install holds an Engramm license, as ONE word: active, inactive or unknown (nobody could check — never read it as a refusal). No wallet, no token,  | `pluginCartridgeActions.ts` |
| `license.unlock` | `license:admin` | Founders only. With 2FA on and a valid code, opens a 15-minute airdrop session in memory. Returns { unlockedUntil }. | `pluginBridgeHandlers.ts` |
| `marks.keyClear` | `marks:registry` | Forgets the sealed key of a registry (`uspto`). Returns the key's state. | `pluginCartridgeActions.ts` |
| `marks.keySet` | `marks:registry` | Seals a trademark registry API key (`uspto` only) on this machine. Returns the key's state, never the key. | `pluginCartridgeActions.ts` |
| `marks.keyState` | _(none)_ | The key is sealed in main; no action ever returns it. Ungated, like vulns.mirrorStatus: asked when the window opens, it reveals only THAT a key is stored, and a | `pluginCartridgeActions.ts` |
| `marks.mirrorCancel` | `marks:mirror` | Stops the running register download or build. The previous register stays whole. Returns { cancelled }. | `pluginCartridgeActions.ts` |
| `marks.mirrorDownload` | `marks:mirror` | Starts downloading an office's trademark register and building it on disk. Returns at once; ALREADY_RUNNING when busy. | `pluginCartridgeActions.ts` |
| `marks.mirrorPlan` | `marks:mirror` | Asks a trademark office (ipau, cipo, inpi, prv) what a download would fetch: size, archive, dates. Writes nothing. | `pluginCartridgeActions.ts` |
| `marks.mirrorRemove` | `marks:mirror` | Deletes an office's register file from disk. Refused while a job or a search runs. | `pluginCartridgeActions.ts` |
| `marks.mirrorStatus` | _(none)_ | Ungated, like vulns.mirrorStatus: it reveals only whether a public register is on disk. | `pluginCartridgeActions.ts` |
| `marks.search` | `marks:mirror` | Local search of up to 200 `names` in every installed register. Registers not installed are listed in `missing`. | `pluginCartridgeActions.ts` |
| `marks.verify` | `marks:registry` | One authenticated call to the USPTO API with the sealed key: whether the key works, and the bulk file listing. | `pluginCartridgeActions.ts` |
| `metrics.get` | `metrics:read` | Host system metrics (CPU/RAM/GPU snapshot). | `pluginBridgeHandlers.ts` |
| `mnemosyne.focus` | `vault:read` | Returns { filePath, content }: the first 10,000 chars of a file, read by the same home-scoped host read as dialog.readFile. Refuses '..'. | `pluginCartridgeActions.ts` |
| `mnemosyne.ingest` | `vault:write` | Write one chronicle into a vault and return its chronicleId. Same pipeline as social.ingest: routePulse, PromptShield, SHA-256 dedup, persistence. (It formerly  | `pluginCartridgeActions.ts` |
| `mnemosyne.prime` | `vault:read` | A text session briefing, no model call: each vault with its chronicle count and state, then the 5 latest conversations. | `pluginCartridgeActions.ts` |
| `mnemosyne.query` | `vault:read` | Answers a question (max 2,000 chars) from the user's memory: model.infer with RAG on, like the chat. Spends an inference. | `pluginCartridgeActions.ts` |
| `mnemosyne.status` | `vault:read` | Host/vault status snapshot. | `pluginCartridgeActions.ts` |
| `model.getConfig` | `model:infer` | The host model config, INCLUDING the live API key of the active cloud provider. | `pluginBridgeHandlers.ts` |
| `model.getInstalled` | `model:infer` | The registry and custom model entries whose files are on disk. | `pluginCartridgeActions.ts` |
| `model.getStatus` | `model:infer` | Read-only visibility into which engines are available, so a cartridge can offer an informed model choice; the selection is applied per call through model.infer' | `pluginCartridgeActions.ts` |
| `model.infer` | `model:infer` | An inference may have spent cloud credits, so the cached balance is dropped afterwards (win or fail — a failed call can still have been metered). | `pluginBridgeHandlers.ts` |
| `model.warmLocal` | `model:infer` | Preload a specific local model (spawn worker + load into memory) so a cartridge can surface a load failure — e.g. a model too heavy for the available RAM — BEFO | `pluginCartridgeActions.ts` |
| `openDirectoryDialog` | `dialog:open` | Opens the OS folder picker. Returns { success, path }; success is false when the user cancels. | `pluginBridgeHandlers.ts` |
| `orb.summon` | _(none)_ | Bring the orb onto the board, listening (doc 123: the microphone stays with the host, so a cartridge with a voice of its own hands it to her). Ungated like the  | `pluginCartridgeActions.ts` |
| `payment.balance` | `license:admin` | Founders only. The till wallet's ETH and USDC balances, read over RPC: { ethBalance, usdcBalance, offline }. | `pluginBridgeHandlers.ts` |
| `payment.exportKey` | `license:admin` | Founders only. RETURNS the till wallet's private key in plaintext, on every call. | `pluginBridgeHandlers.ts` |
| `payment.generate` | `license:admin` | Founders only. Creates the till wallet and stores its key encrypted on this machine, only if none exists. Returns { address, existed }. | `pluginBridgeHandlers.ts` |
| `payment.reset` | `license:admin` | Founders only. Deletes the till wallet's key from this machine (lost unless exported). Refuses unless RPC reads 0 ETH and 0 USDC. | `pluginBridgeHandlers.ts` |
| `payment.status` | `license:admin` | Founders only. The till wallet's address from local config, or null. No network call. | `pluginBridgeHandlers.ts` |
| `permissions.refresh` | _(none)_ | Re-read this cartridge's manifest from disk and REPORT which of the asked permissions it now holds. Enforcement uses the registry built at startup, so a manifes | `pluginCartridgeActions.ts` |
| `plugins.detach` | _(none)_ | A cartridge opens one more window of ITSELF (Parts detaches a model into its own window). Ungated: the id is the trusted caller's, never the payload's, so no ca | `pluginCartridgeActions.ts` |
| `plugins.getInstalled` | `vault:read` | Every installed cartridge with its manifest, icon and premium flag. | `pluginCartridgeActions.ts` |
| `plugins.getLinkedDev` | `vault:read` | Dev-link bridge (Muse): a builder cartridge scaffolds a REAL cartridge in the user's app space, so it must be able to link that folder and open it in its own Mn | `pluginCartridgeActions.ts` |
| `plugins.install` | `vault:write` | Installs a cartridge from an https git repository into the plugins folder, after the license gates. | `pluginCartridgeActions.ts` |
| `plugins.launch` | `vault:read` | Opens an installed/linked cartridge in its own window. | `pluginCartridgeActions.ts` |
| `plugins.linkDev` | `vault:write` | Links a LOCAL folder as a dev cartridge so it can be launched in its own Mnemosyne window. | `pluginCartridgeActions.ts` |
| `plugins.uninstall` | `vault:write` | Deletes an installed cartridge's folder by `id`. Dev-linked cartridges are refused. | `pluginCartridgeActions.ts` |
| `plugins.unlinkDev` | `vault:write` | Unlinks a dev cartridge folder. | `pluginCartridgeActions.ts` |
| `reader.downloadUrl` | `vault:read` | Download a remote document (PDF/EPUB/JSON/…) to a managed local file, then the cartridge runs its extract/parse flow on the returned path. Host-side download (E | `pluginReaderActions.ts` |
| `reader.extractDocument` | `vault:read` | Extract plain text from a PDF/DOCX/text file on disk (path from the OS dialog). Streaming (`sdk.stream`) adds page-by-page OCR progress for THIS file, as `{"pag | `pluginReaderActions.ts` |
| `reader.ingest` | `vault:write` | Vectorize + archive one chunk of book text into a Library vault (SHA-256 dedup host-side). Tagged with the DOCUMENT spine — book text is not social data, so it  | `pluginReaderActions.ts` |
| `reader.renderPage` | `vault:read` | Render one page of the original PDF → JPEG (base64) for the reader's side-by-side "compare with the source" view (host-side pypdfium2, one page at a time so eve | `pluginReaderActions.ts` |
| `reader.ttsSpeak` | `model:infer` | Synthesize one unit of text → raw PCM (base64) the cartridge plays via Web Audio. The cartridge chooses the WORDS, the engine and the pace; the host owns the DE | `pluginReaderActions.ts` |
| `reader.ttsStatus` | `model:infer` | Is a local neural voice engine installed + licensed? Defaults to the user's own. | `pluginReaderActions.ts` |
| `reader.ttsVoices` | `model:infer` | Installed Piper voice ids (Piper is the one engine whose voices are downloaded FILES; the cloning engines' voices are language codes, carried by the catalogue). | `pluginReaderActions.ts` |
| `reader.ttsWarm` | `model:infer` | Preload a neural engine (spawn sidecar + load model) ahead of first synthesis. A cold sidecar is ~30s — warming lets the reader show a loading state. | `pluginReaderActions.ts` |
| `reader.voiceConfig` | `model:infer` | Resolve the voice a LONG READ speaks with (Settings → Voice), plus the catalogue of installed engines so the cartridge never has to guess what an id means. host | `pluginReaderActions.ts` |
| `registry.list` | `license:admin` | Reserved-pseudonym registry (alias → wallet) for the Founders Console. Signed with the sovereign wallet in main; the gate enforces VALIDATOR_WALLETS. | `pluginBridgeHandlers.ts` |
| `saveGlobalConfig` | `settings:write` | Saves `geminiApiKey` as the cloud API key and `activeLocalModel` as the local model in the host config. An empty field keeps the current value. | `pluginBridgeHandlers.ts` |
| `scout.start` | `scout:run` | Starts the app-wide hourly arXiv/HAL scout for `query` from `source`. Papers found land in the DEV vault. A new start replaces the last. | `pluginBridgeHandlers.ts` |
| `scout.stop` | `scout:run` | Stops the app-wide research scout, whoever started it. Answers success even when nothing was running. | `pluginBridgeHandlers.ts` |
| `sendPulse` | _(none)_ | Legacy stub that talks to no P2P node: P2P_STATUS gets a fixed offline answer (no peers), anything else { success: true }. | `pluginBridgeHandlers.ts` |
| `setEmbedModel` | `model:infer` | Switches the host's primary embedding model to a Dev Edition catalog id and saves the model config. Returns { success, dimChanged, prevDim, newDim }. | `pluginBridgeHandlers.ts` |
| `settings.open` | _(none)_ | Opens Mnemosyne's Settings on the page where a feature this cartridge uses is installed ('theia' = Images, 'ocr'). Only from a click in the frame, and only thos | `pluginCartridgeActions.ts` |
| `shell.openExternal` | _(none)_ | Open a URL in the OS browser. Sandboxed cartridge iframes have no 'allow-popups', so target="_blank" is blocked — they route external links here instead. The ho | `pluginBridgeHandlers.ts` |
| `site.addDomain` | `site:publish` | Attaches a domain the person owns to the project (buying one is not here). Requires the frame to have focus. | `pluginStudioActions.ts` |
| `site.declareFolder` | `site:publish` | Ask the person to pick the folder of a website in the system's own dialog. The cartridge gets an id and a name, never the path. | `pluginStudioActions.ts` |
| `site.deploy` | `site:publish` | Publish a declared site folder to the person's Vercel account under a project name; main uploads with the sealed token and answers Vercel's own state (READY, ER | `pluginStudioActions.ts` |
| `site.folders` | `site:publish` | The site folders this cartridge declared, with `missing` when one was moved or deleted. | `pluginStudioActions.ts` |
| `site.forgetFolder` | `site:publish` | Forget a declared site folder. The files stay on disk: they are the person's. | `pluginStudioActions.ts` |
| `site.hosting` | `site:publish` | A Vercel project's own addresses (doc 145 §10.14): each domain she attached, whether Vercel accepts it and whether it points there, and the DNS records to write | `pluginStudioActions.ts` |
| `site.removeDomain` | `site:publish` | Detaches a domain from the project; it stays hers at her registrar. Requires the frame to have focus. | `pluginStudioActions.ts` |
| `site.removeToken` | `site:publish` | Deletes the sealed hosting token. Requires the frame to have focus. | `pluginStudioActions.ts` |
| `site.saveAsset` | `site:publish` | Write one file into a declared site folder, by relative name (`assets/a.webp`, `index.html`). Pictures, mp4/webm clips and the text files of a static site; main | `pluginStudioActions.ts` |
| `site.setToken` | `site:publish` | The hosting token, typed once in the cartridge and sealed in main. Rejects with EMPTY · HAS_WHITESPACE · LOOKS_LIKE_URL · TOO_LONG · SEAL_REFUSED. Requires the  | `pluginStudioActions.ts` |
| `site.tokenState` | `site:publish` | Whether the person's hosting token (Vercel) is stored, when, and how this machine seals it. Never the token: no action returns it. | `pluginStudioActions.ts` |
| `site.traffic` | `site:publish` | The project's visits over 7, 30 or 90 days: by day, by referring site, by country. A part Vercel did not answer is null, never an empty list. | `pluginStudioActions.ts` |
| `social.fetch` | `vault:read` | Host-side HTTPS GET of `url` (12 s, 4 MB cap, redirects followed): { status, body, encoding, truncated, contentType }. | `pluginCartridgeActions.ts` |
| `social.ingest` | `vault:write` | Real vault ingest/query + host-side fetch for the multi-network hub. | `pluginCartridgeActions.ts` |
| `social.query` | `vault:read` | Raw chronicle read from a NAMED vault (no LLM). | `pluginCartridgeActions.ts` |
| `speech.listenCancel` | `model:infer` | Drop this cartridge's recording without transcribing (the person changed their mind, the panel closed). Releases the device; `{ cancelled }` says whether there  | `pluginReaderActions.ts` |
| `speech.listenStart` | `model:infer` | Start listening on the HOST's microphone for this cartridge. The frame never touches the device: the host records (the mic light counts it), and the words come  | `pluginReaderActions.ts` |
| `speech.listenStop` | `model:infer` | Stop this cartridge's recording and transcribe it with the engine Settings › Voice resolves to (local when chosen or when no cloud key exists, else cloud). Retu | `pluginReaderActions.ts` |
| `speech.status` | `model:infer` | Whether a cartridge can dictate right now: an STT engine the person set up in Settings › Voice (local Whisper or a cloud key), and whether another cartridge alr | `pluginReaderActions.ts` |
| `spine.llmScan.start` | `vault:write` | Start the LLM spine classifier (Spine Sense) on one vault's unsorted bucket: batched excerpts → the Settings model → existing-taxon assignment or governed creat | `pluginBridgeHandlers.ts` |
| `spine.llmScan.status` | `vault:read` | Progress snapshot of the running (or last finished) spine scan job. | `pluginBridgeHandlers.ts` |
| `spine.llmScan.stop` | `vault:write` | Ask the running spine scan to stop after the current batch (resumable later). | `pluginBridgeHandlers.ts` |
| `splat.align` | `dialog:open` | Put two objects of the same place, filmed at two dates, in one frame ({ refId, movedId }, doc 163 lot 5): the moved object's frames are placed in the reference' | `pluginStudioActions.ts` |
| `splat.alignCancel` | `dialog:open` | Stop the alignment: COLMAP is killed and its work folder erased. | `pluginStudioActions.ts` |
| `splat.alignStatus` | `dialog:open` | The alignment running now (its step and, when done, its numbers), or null. | `pluginStudioActions.ts` |
| `splat.cancel` | `dialog:open` | Stop the job ({ id }): the tool is killed and its folder erased. | `pluginStudioActions.ts` |
| `splat.continue` | `dialog:open` | « Continue anyway » after a short turn ({ id }), on the person's click. | `pluginStudioActions.ts` |
| `splat.frames` | `dialog:open` | The frame files of one folder of an object, or of the job making it ({ id, dir }): 'all' every frame read (while the video is read too), 'frames' the kept ones, | `pluginStudioActions.ts` |
| `splat.free` | `dialog:open` | Send one category of an object to the recycle bin ({ id, category }), on a click only: framesAll, framesMasked, video, or work (the job's scratch; the placement | `pluginStudioActions.ts` |
| `splat.list` | `dialog:open` | The objects already made, newest first: id, date, quality, object or scene, frames placed, turn filmed, scene file and size (+ the kept .ply), a frame for the c | `pluginStudioActions.ts` |
| `splat.pickPhotos` | `dialog:open` | Ask the person for a folder of photos in the system's own dialog; answers its path, or null when they closed it. No deadline: the dialog stays open while they c | `pluginStudioActions.ts` |
| `splat.pickVideo` | `dialog:open` | Ask the person for a video in the system's own dialog; answers its path, or null when they closed it. No deadline: the dialog stays open while they choose. | `pluginStudioActions.ts` |
| `splat.read` | `dialog:open` | One piece (≤ 8 MB, base64) of an object's file ({ id, file, offset?, length? }): scene.spz, scene.ply, cameras.json, manifest.json, a frame (frames/, frames-all | `pluginStudioActions.ts` |
| `splat.redo` | `dialog:open` | Redo an object already made with other settings ({ id, quality, scope? }), on a click only. Its frames, placement and cut-outs are reused; a new object. | `pluginStudioActions.ts` |
| `splat.remember` | `dialog:open` | Put an object in a vault ({ id }), on the person's click (doc 163 §10): its note and thumbnail go to the capture flow on the board, which asks which vault. The  | `pluginStudioActions.ts` |
| `splat.setMain` | `dialog:open` | This finished object becomes the main version of its object ({ id }), on a click only: the version its card shows. Without a choice, the newest is. | `pluginStudioActions.ts` |
| `splat.start` | `dialog:open` | A video, or a folder of photos, becomes a 3D object, on a click only ({ videoPath or photosDir, quality: 'preview' \| 'full', scope?: 'object' \| 'scene' }). 'o | `pluginStudioActions.ts` |
| `splat.status` | `dialog:open` | The engine's state, whether « the object alone » can run (objectOnly: ready · noEngine · noMatte) and the job. Nothing here downloads (rule of 2026-10-09): COLM | `pluginStudioActions.ts` |
| `state.get` | _(none)_ | Ungated on purpose: this is the cartridge's OWN blob, namespaced by the caller's id and size-capped — the same trust level as the localStorage it backs up, with | `pluginCartridgeActions.ts` |
| `state.set` | _(none)_ | Replaces this cartridge's own durable settings blob (`state`, a JSON object up to 256 KB), kept host-side under its id. | `pluginCartridgeActions.ts` |
| `stats.activity` | `license:admin` | The org's public GitHub activity — who starred and when, forks, comments, discussions, releases, traffic. Public data, admin-scoped for the same reason as the d | `pluginBridgeHandlers.ts` |
| `stats.downloads` | `license:admin` | Release download counts as GitHub keeps them (per asset, auto-updates included) — the Founders Console's adoption view. Read-only public data, admin-scoped beca | `pluginBridgeHandlers.ts` |
| `stats.downloadSnapshots` | `license:admin` | One snapshot of GitHub's release counters per UTC day, taken by the gate's cron: the curve that exists even on days the console stayed closed. | `pluginBridgeHandlers.ts` |
| `stats.installs` | `license:admin` | Cartridge installs counted by the gate (doc 39 §1.2): one row per catalog app. Founder-signed in main; the gate re-checks VALIDATOR_WALLETS. | `pluginBridgeHandlers.ts` |
| `stats.issueWatch` | `license:admin` | GitHub threads the founder is waiting on: an issue opened on someone else's tracker gets its answer days later, on a page nobody reloads. Read only, admin-scope | `pluginBridgeHandlers.ts` |
| `stats.issueWatchSeen` | `license:admin` | Founders only. Records in a local file that a watched GitHub thread was seen at `comments` comments. | `pluginBridgeHandlers.ts` |
| `stats.npm` | `license:admin` | npm's own download counters for the project's published packages — the other half of the adoption view, and the only one with a dated daily axis. | `pluginBridgeHandlers.ts` |
| `stats.opsSnapshots` | `license:admin` | The gate's daily record of repo counters and credit-program totals. | `pluginBridgeHandlers.ts` |
| `stats.searchConsole` | `license:admin` | Search Console clicks + impressions through the founder's service account. | `pluginBridgeHandlers.ts` |
| `stats.searchConsoleKey` | `license:admin` | The service-account key's state; `import` opens a native picker in main. | `pluginBridgeHandlers.ts` |
| `stats.siteTraffic` | `license:admin` | The .io's visitors per day and by referrer / utm_source (Vercel Web Analytics). | `pluginBridgeHandlers.ts` |
| `stats.stripeHistory` | `license:admin` | Sales, abandoned checkouts and refunds per month, summed from Stripe. | `pluginBridgeHandlers.ts` |
| `submissions.preflight` | `license:admin` | Static preflight of a submitted repo (download + inspect, never execute). Founders-only; enforcement is main-side (isFounder) in plugins:preflightRepo. | `pluginBridgeHandlers.ts` |
| `submissions.review.decide` | `license:admin` | Founders only. Sets a submission's status (approved, rejected, published, changes_requested) and note on the gate. Publishes nothing. | `pluginBridgeHandlers.ts` |
| `submissions.review.list` | `license:admin` | Real enforcement is SERVER-side: each call is signed with the sovereign wallet in main and the gate requires VALIDATOR_WALLETS membership — the permission gate  | `pluginBridgeHandlers.ts` |
| `system.agentPort` | `metrics:read` | Same family as the metrics above — a reading about the machine, not about the memory — so it rides the same permission rather than inventing one. NOT ungated li | `pluginBridgeHandlers.ts` |
| `takeaway.copyFrom` | `dialog:open` | Copy one of the person's files (from their home) into an export folder; main copies it, nothing crosses as base64. | `pluginStudioActions.ts` |
| `takeaway.copyTo` | `dialog:open` | Copy a file of an import folder into the person's home, under a new name (never over an existing file). | `pluginStudioActions.ts` |
| `takeaway.list` | `dialog:open` | The entries of a picked folder, or of a folder inside it. | `pluginStudioActions.ts` |
| `takeaway.pickFolder` | `dialog:open` | The person picks a folder (a USB key, another disk) in the system's own dialog; the cartridge gets an id and a name. `purpose: 'export'` makes a subfolder named | `pluginStudioActions.ts` |
| `takeaway.read` | `dialog:open` | A text file of a picked folder (a copy's records). | `pluginStudioActions.ts` |
| `takeaway.write` | `dialog:open` | Write one file (text, or bytes as base64) into an export folder, by relative name. | `pluginStudioActions.ts` |
| `translator.translate` | `vault:read` | Non-streaming translation: sends text + language pair, returns translated text. | `pluginCartridgeActions.ts` |
| `ui.openInNotes` | `dialog:open` | Opens a document by path in the host's Notes app, in its own window unless `detached: false`. Refuses what Notes cannot render. Notes brings its reader, its too | `pluginBridgeHandlers.ts` |
| `updateWatchedFolders` | `vault:write` | Meant to replace the DEV vault's DocWatch folders. Known defect: it reads fields the vault tree no longer has, so it always throws. | `pluginBridgeHandlers.ts` |
| `vault.create` | `vault:write` | Creates and mounts a vault folder (vault-meta.json, snapshots) under `parentDir`. An existing vault folder there is reused. | `pluginBridgeHandlers.ts` |
| `vault.delete` | `vault:write` | Destroy a vault's memory (and, with deleteDocs, its folder). Symmetric with vault.create — a benchmark/sandbox cartridge (MnemoArena) uses it to wipe its own is | `pluginBridgeHandlers.ts` |
| `vault.getConfig` | `vault:read` | The workspace root config (absolute rootPath, workspaceName, usage profiles), or null. | `pluginBridgeHandlers.ts` |
| `vault.getScannedPapers` | `vault:read` | Standard document metadata for all scanned papers. | `pluginBridgeHandlers.ts` |
| `vault.memoryStats` | _(none)_ | State and chronicle count of ONE vault (`vaultId`). No permission: the host asks the human the first time, at `level` (default NORMAL). | `pluginBridgeHandlers.ts` |
| `vault.pack.ensure` | `vault:write` | The vault of one Memory Pack (doc 135 §6.6.2): `<knowledge root>/<app>/ kp-<app>-<pack>/`, created on first call. The cartridge names the PACK and nothing else; | `pluginCartridgeActions.ts` |
| `vault.reclassify` | `vault:write` | Re-derives the spine types of a vault's file-backed chronicles from `rules` (SQL update, no re-embed, no dry run). Returns counts. | `pluginBridgeHandlers.ts` |
| `vault.removeDocWatch` | `vault:write` | Removes a DocWatch target from a vault. | `pluginBridgeHandlers.ts` |
| `vault.rescan` | `vault:write` | Deletes a vault's DocWatch and git-history chronicles and its source registry, re-ingests the watched folders, queues a re-embed. | `pluginBridgeHandlers.ts` |
| `vault.sandbox.describeTile` | `vault:write` | Declares how the host should render this app's vault tile: an icon and up to 3 metrics ({ label, spine? }) the HOST computes from spine stats — the app never in | `pluginCartridgeActions.ts` |
| `vault.sandbox.ensure` | `vault:write` | A cartridge may ensure exactly ONE vault: its own walled-off sandbox (doc 58). The app id is the TRUSTED pluginId of the bridge — never the payload — so a cartr | `pluginCartridgeActions.ts` |
| `vault.sandbox.forget` | `vault:write` | Forget rows the app itself wrote in its OWN sandbox — what an app needs to offer "delete this project" without wiping its whole vault. The app id is the TRUSTED | `pluginCartridgeActions.ts` |
| `vault.sandbox.saveImage` | `vault:write` | Save one PICTURE into this app's own sandbox vault, so DocWatch ingests it and Theia can find it later ("show me the days it snowed"). The caller gives a NAME a | `pluginCartridgeActions.ts` |
| `vault.scanTree` | `vault:read` | Scans the subvault workspace directory hierarchy. | `pluginBridgeHandlers.ts` |
| `vault.setDocWatch` | `vault:write` | Adds or updates a DocWatch target for a vault. | `pluginBridgeHandlers.ts` |
| `vault.spineStats` | `vault:read` | Per spine type, the total and vectorized chronicle counts of a mounted vault. The payload is the bare workspaceId or path. | `pluginBridgeHandlers.ts` |
| `vault.updateManifest` | `vault:write` | Patches a vault's vault-meta.json: name, color, icon, description, the permissions block (MAXIMUM to NORMAL too), lexicalOnly. | `pluginBridgeHandlers.ts` |
| `video.generate` | `video:generate` | Start one Veo clip from a first and an optional last picture (4, 6 or 8 s, 16:9 or 9:16), billed per second. Answers a job at once; follow it with video.status. | `pluginStudioActions.ts` |
| `video.joinFilm` | `dialog:open` | The film's parts ({ path, in?, out? }, absolute paths inside the home), each from its cut, joined into `outBase` + .mp4 (.webm when the machine has no H.264 enc | `pluginStudioActions.ts` |
| `video.status` | `video:generate` | The state of a clip THIS cartridge started (running, done with its path, failed with its cause). Another app's clip answers UNKNOWN_JOB. | `pluginStudioActions.ts` |
| `video.toolsStatus` | `dialog:open` | Whether ffmpeg is installed (from Settings > Video, never by a cartridge) and how big its download is. | `pluginStudioActions.ts` |
| `vulns.mirrorCancel` | `vulns:mirror` | Stops the running OSV download or update of an ecosystem. Returns { cancelled }. | `pluginCartridgeActions.ts` |
| `vulns.mirrorDownload` | `vulns:mirror` | Starts downloading an ecosystem's full OSV dump and building the local mirror. Returns at once; poll vulns.mirrorStatus. | `pluginCartridgeActions.ts` |
| `vulns.mirrorDumpSize` | `vulns:mirror` | Size and date of an ecosystem's OSV dump (npm, PyPI, crates.io), from one HEAD request: { bytes, lastModified }. | `pluginCartridgeActions.ts` |
| `vulns.mirrorQuery` | `vulns:mirror` | Local read, no network: the OSV records naming the given package `names` (up to 20,000), with the mirror's date. | `pluginCartridgeActions.ts` |
| `vulns.mirrorStatus` | _(none)_ | Download and update return at once; the cartridge polls the status. A refusal from main is thrown, never answered as an empty state. Ungated on purpose, like co | `pluginCartridgeActions.ts` |
| `vulns.mirrorUpdate` | `vulns:mirror` | Starts fetching the OSV records changed since the mirror's newest date. NO_MIRROR when there is none. Returns at once. | `pluginCartridgeActions.ts` |
| `watch.clearInbox` | `watch:background` | Removes the given `ids` from this cartridge's inbox, or every item when `ids` is absent or empty. Returns the count left. | `pluginCartridgeActions.ts` |
| `watch.inbox` | `watch:background` | This cartridge's background-watch inbox, with its status (targets, interval, last run, last error, unread). | `pluginCartridgeActions.ts` |
| `watch.register` | `watch:background` | A cartridge is an iframe: it cannot notice what arrived while closed. These four let it hand the host a declarative watch and read the result. The cartridge id  | `pluginCartridgeActions.ts` |
| `watch.unregister` | `watch:background` | Deletes this cartridge's background watch, unread inbox included. | `pluginCartridgeActions.ts` |

**Ungated actions (no permission gate — run on any loaded cartridge):** `canvas.leaveBoard`, `canvas.openBoard`, `cockpit.state`, `getStatus`, `hub.showUpdate`, `irinaHealthCheck`, `license.offer`, `license.status`, `marks.keyState`, `marks.mirrorStatus`, `orb.summon`, `permissions.refresh`, `plugins.detach`, `sendPulse`, `settings.open`, `shell.openExternal`, `state.get`, `state.set`, `vault.memoryStats`, `vulns.mirrorStatus`.
<!-- GENERATED:CARTRIDGE-ACTIONS:END -->

**Rules:**

- If an action is **not** in this table, it does not exist. Do not invent `vault.search`, `memory.add`, `chat.send`, etc. Use the exact names above.
- Payload shapes follow the reference cartridge ([MnemoReader](https://github.com/Mnemosyne-OS/MnemoReader---MnemosyneOS)). When unsure, read the reference — do not guess a field name.

## 4. Build & ship gotchas (each of these silently breaks a cartridge)

- **`vite base: './'` + relative entrypoint.** The cartridge is served from a local path, not a server root. Absolute asset paths 404.
- **Commit `dist/`.** The published cartridge serves the built `dist/`, not your source.
- **No `window.confirm` / `window.alert` / `prompt()`.** They are blocked in the sandboxed iframe and return silently. Use a `dialog:*` action or your own in-app UI.
- **No Node / Electron / `fs` / `process`.** Sandbox only. Everything host-side goes through `sdk.invoke`.
- **Tests: keep the glob at `{ts,tsx}`.** `vite.config.ts` collects
  `src/**/*.test.{ts,tsx}`. Narrowing it to `.test.ts` is the classic silent
  failure here: a rendering test in a `.tsx` is then collected by NOBODY, the
  suite stays green, the test counter does not move, and nothing announces that
  a file was skipped. The same two extensions must stay in `tsconfig.json`'s
  `exclude`, or that file rides into the shipping build instead.
- **Nothing types your tests unless you run `pnpm typecheck`.** The build's
  `tsc` excludes them on purpose, so shipping does not require vitest
  installed. Lint rules are not a type checker. `pnpm typecheck` runs
  `tsconfig.eslint.json`, which includes everything.

- **`vault:write` is real and permanent.** Writes land in the user's memory and are shared with every future agent. The human governs: never write without the user's explicit intent, and write self-contained content.

## 4b. The default look: liquid glass

`src/glass.css` is imported once in `main.tsx` and gives every cartridge the same look. Keep it,
and build on it rather than around it:

- **Every button, field, select and textarea is glass by default.** Never a solid block of
  colour. The main action of a screen gets `className="primary"`: the same glass, tinted green.
- **A card or a panel** gets `className="glass"`.
- **A choice among a few** (fewer than about ten) is a row of tiles, not a dropdown:
  `className="chip-tile glass"`, plus `chosen` on the chosen one. It turns green with a check.
- **A view switch** (sizes, modes) is drawn with icons, the way a file browser does (nine small
  squares, four, one large), inside `className="segmented glass"` with `icon-btn` buttons. The
  word goes in `title` and `aria-label`, not on screen.
- **Use the whole width.** No `max-width` on a working panel: put the cards in `className="g-grid"`
  (side by side as soon as two fit), and give a card that would sit alone on its row `full`.
  At 375 px nothing may overflow sideways.
- **A full-screen view** puts its bar at the top, its close button in the top-right corner, and
  closes on a click anywhere. Only the controls stop the click.
- The tokens (`--g-text`, `--g-chosen`, `--glass-fill`…) follow the host theme the OS broadcasts,
  and fall back to a dark look on their own.

## 5. Layer 2 app (only if you are a separate process — not a cartridge)

```ts
import { MnemoClientBrowser } from '@mnemosyne_os/sdk';
const client = await MnemoClientBrowser.connect(); // ws://127.0.0.1:7799 — the OS must be running
```

- `MnemoClientBrowser` for browser / renderer / Electron-renderer (native WebSocket, zero Node deps).
- `MnemoClient` for Node.js / Electron-main.
- Each call is authenticated with a per-app JWT; only local / first-party origins are accepted.

## 6. MCP server (only to plug an external AI assistant into memory)

- Package: `@mnemosyne_os/mcp`. Requires the Mnemosyne app (Infinity Edition) running so the `7799` server is up.
- Legacy `@mnemosyne-workspace/mcp-server` — **do not use.**

## Packages

| Package | Use it for | Version |
|---|---|---|
| `@mnemosyne_os/cartridge-sdk` | Cartridge (this guide) | 0.4.1 |
| `@mnemosyne_os/sdk` | Layer 2 app | 1.5.5 |
| `@mnemosyne_os/mcp` | MCP server | 1.9.0 |
| `@mnemosyne_os/create-app` | Scaffold (`npm create @mnemosyne_os/app`) | 1.0.4 |
| `@mnemosyne_os/forge` (CLI) | Publish / tooling | 1.4.7 |

## Hard rules for the agent

1. Use **only** the actions in §3. Never invent an API name or a payload field.
2. Declare **only** the permissions you actually call.
3. The core engine is **sealed** — describe its capabilities conceptually; never assume an internal implementation detail.
4. Copy the boilerplate and read the [MnemoReader reference](https://github.com/Mnemosyne-OS/MnemoReader---MnemosyneOS) before writing from scratch.
5. When a fact is not in this file, the reference cartridge, or the repo root `llms.txt` — stop and ask, do not guess.

---

*Further reading: the repo root `llms.txt` (developer entry point: surfaces + this same action table). The action table between the GENERATED markers is produced from the host registry in the source monorepo and synced here — do not edit it by hand.*
