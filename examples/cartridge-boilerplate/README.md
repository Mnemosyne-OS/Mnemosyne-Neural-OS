# Cartridge Boilerplate

Copy this folder. It is a working Mnemosyne OS cartridge: it claims its own
sandbox vault, writes and reads memory, calls the host's model, and opens a
native folder dialog.

> **This template is meant to be copied anywhere.** Its dependency on
> `@mnemosyne_os/cartridge-sdk` is a real npm range (`^0.1.0`), not a workspace
> link — so `pnpm install` works the moment you copy it out of this repo.

## What a cartridge is

A web app in a sandboxed iframe inside the Mnemosyne window. No Node, no
Electron, no `window.mnemo`. Every call to the OS is an async `postMessage`
through `MnemoCartridgeSDK`. That isolation is the product: it's why a user
installs your app at all.

## Run it

```bash
pnpm install
pnpm dev          # vite on 127.0.0.1:5185 (strictPort)
```

Then, in Mnemosyne: **MnemoHub → My dev apps → link this folder**.

> The first dev-linked cartridge is free. The **second and beyond require an
> active Engramm license** (`DEV_LINK_LICENSE_REQUIRED`). Budget for it.

## The five-minute tour

`src/App.tsx` is the whole demo. In boot order:

```ts
const sdk = new MnemoCartridgeSDK('@mnemosyne-plugins/boilerplate');

// 1. Claim your vault. Once, at boot, BEFORE any write.
const { vault, unlocked } = await sdk.ensureSandbox();

// 2. Tell the host how to draw your tile. The host counts the metric itself,
//    from spine stats — so the tile stays alive when your app is closed.
await sdk.describeVaultTile({ icon: '⚙️', metrics: [{ label: 'Notes', spine: 'BOILERPLATE_NOTE' }] });

// 3. Write and read. Always target YOUR vault by name.
await sdk.socialIngest(vault, 'something worth remembering', 'BOILERPLATE_NOTE');
const res = await sdk.socialQuery(vault, 20);
```

Anything not on the SDK: `sdk.invoke('<action>', payload)`. The action list is
generated and authoritative — see `AGENTS.md` §3 in this folder.

## The traps

These are not hypothetical. Each one has cost someone a night.

**`vault:write` is load-bearing, and its absence is silent.** Without it in
`mnemo-plugin.json`, `ensureSandbox()` / `describeVaultTile()` / `socialIngest()`
are denied **with no user-visible error** — you just never get a vault. This
template declares it. If your cartridge never writes memory, remove it: it is a
*sensitive* permission and the store preflight flags it.

**Renaming your app orphans its memory.** Vault ownership is keyed on the
manifest `name`. Change it and the next `ensureSandbox()` creates a fresh vault
and abandons the old one, with everything in it. There is no migration path.
Pick the name once.

**The vault exists at first launch, never at install.** Do not expect it to be
there before your code has run once.

**Cartridges share an origin.** They all load from `mnemo-plugin://app/<id>`, so
`localStorage` and `IndexedDB` are *not* isolated between installed cartridges.
Keep secrets out of client storage; put state in your vault.

**Permissions are coarser than they look.** One `vault:write` also unlocks
plugin install/uninstall, vault create/reclassify, conversation delete and
DocWatch. `dialog:open` grants read/write of allowlisted file types anywhere
under the user's home. Ask for what you need, and expect the user to notice.

## Publishing

Four things, all enforced by the store preflight:

1. **`entrypoints.renderer` → `"index.html"`** — relative. The dev default here
   is `http://localhost:5185/index.html`, which the preflight rejects as *not
   publishable*. Swap it before you submit.
2. **Commit `dist/`** — the `mnemo-plugin://` protocol serves `dist/<file>`
   first, then the repo root. No build runs on the user's machine.
3. **Keep `base: './'` in `vite.config.ts`** — an absolute `/assets/…` 404s
   under the custom protocol.
4. **Manifest at the repo ROOT**, its `name` matching the submitted app id, and
   a `repository` field in `package.json`.

Host your repo publicly on **github.com, gitlab.com or bitbucket.org** — the
installer's host allowlist is exactly those three. Then: **MnemoHub → Submit my
app** (needs a sovereign wallet; you sign the submission yourself).

Publication is founder-gated and manual, by design: no automated path runs from
a submission to the signed catalog. Expect a human, and a delay.

**On money:** there is no payment, no in-app purchase, and no revenue split
wired today — the store's economy screen is an announcement. Publish because you
want your app in front of people, not because it will pay this month.

## Files

| Path | Why it exists |
|---|---|
| `mnemo-plugin.json` | The manifest. Identity, permissions, entrypoint, widgets. |
| `vite.config.ts` | `base: './'` and port 5185 — both load-bearing, see above. |
| `src/sdk/mnemo-sdk.ts` | A one-line re-export of the shared package. **Do not add methods**; the transport lives in `@mnemosyne_os/cartridge-sdk`. |
| `src/App.tsx` | The demo: sandbox vault, memory write/read, inference, native dialog. |
| `AGENTS.md` | The full build contract for AI coding agents — surfaces, permissions, the authoritative action table. |
