/**
 * @mnemosyne_os/cartridge-sdk — Mnemosyne OS Cartridge SDK
 *
 * Secure communication bridge over window.parent.postMessage for sandboxed
 * in-app cartridges (iframe widgets). THE canonical MnemoCartridgeSDK:
 * every in-repo cartridge re-exports this package (cartridgeSdkDrift.test.ts
 * fails loudly on any copy that reimplements the transport).
 *
 * The cartridge runs in a sandboxed iframe. Everything host-side goes through
 * invoke() → an action whitelisted by the host actionRegistry (see
 * docs/architecture/52 for the full action list). No window globals, no
 * Node/Electron access.
 */

export interface ModelInferPayload {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  stream?: boolean;
  /** Skip the host's RAG context injection for this call. */
  disableRAG?: boolean;
  /** Scope the host's RAG context to one vault. */
  vaultId?: string;
  /**
   * Scope the RAG context to SEVERAL vaults (a mix). The host runs one query
   * per vault and merges them; capped at 12. Takes precedence over `vaultId`.
   * Omit both to search every ACTIVE vault (federated).
   */
  vaultIds?: string[];
  /**
   * Dedicated text for the retrieval embedding. Pass the user's INTENT here
   * when `prompt` also carries long instructions — embedding the whole prompt
   * drowns the topic and the memory search misses.
   */
  ragQuery?: string;
  /** Cap the generated length. Host defaults are 4096 (cloud) / 2048 (local),
   *  which is short for a full document — raise it deliberately. */
  maxTokens?: number;
  /** Pin this ONE call to a route, whatever the global mode is. */
  forceMode?: 'local' | 'cloud';
}

/** A dev-linked cartridge folder (`getLinkedDev`). */
export interface LinkedDevCartridge {
  path: string;
  id?: string;
  displayName?: string;
  version?: string;
  valid: boolean;
  error?: string;
}

/** The user's own credit balance, in USD micro-units (1_000_000 = $1). */
export interface CreditBalanceView {
  wallet: string;
  status: 'active' | 'suspended';
  grantedUsdMicro: number;
  usedUsdMicro: number;
}

export interface ModelInferResult {
  success?: boolean;
  /** The generated text — the host may use `text`, `response`, `content` or `answer` depending on engine/path. */
  text?: string;
  response?: string;
  content?: string;
  answer?: string;
  error?: string;
}

/** Declarative vault tile descriptor (doc 58 §4) — the HOST computes the numbers. */
export interface VaultTileDescriptor {
  /** Emoji shown on the tile instead of the generic flask. */
  icon?: string;
  /** Up to 3 metrics; { label, spine } counts that spine's chronicles, { label } counts all. */
  metrics?: { label: string; spine?: string }[];
}

/**
 * Best-effort host origin for a targeted postMessage — never broadcast to '*'.
 * The cartridge's parent is the trusted host shell; we restrict to its concrete
 * origin and fall back to '*' only for opaque/file:// hosts so delivery never
 * breaks (the host also validates event.source).
 */
function resolveHostOrigin(): string {
  const usable = (o: string | null | undefined): o is string => !!o && o !== 'null' && o !== 'file://';
  try { const ao = window.location.ancestorOrigins?.[0]; if (usable(ao)) return ao; } catch { /* unavailable */ }
  try { if (document.referrer) { const o = new URL(document.referrer).origin; if (usable(o)) return o; } } catch { /* none */ }
  return '*';
}
const MNEMO_HOST_ORIGIN = resolveHostOrigin();

/** Default reply timeout. The host replies to EVERY dispatched request — even an
 *  unknown action gets an error reply — so a non-reply means the host is gone,
 *  wedged, or a native permission dialog is waiting for the human to answer.
 *  The bound must therefore be HUMAN-paced, not machine-paced: the FIRST call of
 *  any permission-gated action can open the host's "Security Authorization
 *  Required" dialog, and a 30s bound races the human reading it (the grant lands
 *  seconds after the timeout and the cartridge boots into a dead session). The
 *  timeout still exists so a dead bridge settles the promise and releases the
 *  listener instead of leaking it for the life of the page. */
const DEFAULT_INVOKE_TIMEOUT_MS = 300_000;

/** A collision-resistant correlation id for one request/stream. Wider than
 *  invoke()'s `Math.random().slice` so two concurrent streams never share an id
 *  (the whole streaming contract is keyed on it). */
function newMessageId(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/** The rejection reason for an aborted stream — the signal's own reason when it
 *  carries one, else a standard AbortError. */
function abortReason(signal?: AbortSignal): Error {
  const reason = signal?.reason;
  if (reason instanceof Error) return reason;
  return new DOMException('The stream was aborted.', 'AbortError');
}

// ── Streaming primitive (request-scoped, correlated by messageId) ───────────────

/**
 * One incremental output channel for {@link MnemoCartridgeSDK.stream}. The host
 * pushes, correlated by the request's `messageId`:
 *   - MNEMO_PLUGIN_CHUNK  → onChunk(text), zero or more, in order
 *   - MNEMO_PLUGIN_DONE   → resolves with the accumulated text (+ terminal data)
 *   - MNEMO_PLUGIN_ERROR  → rejects (an upstream failure NEVER arrives as a
 *                           silent short answer — it is always an error)
 * On abort the SDK posts MNEMO_PLUGIN_CANCEL back so the host stops the upstream
 * work, then rejects. Every path removes the listener and clears the timer.
 */
export interface StreamOptions {
  /** Called for each text chunk, in arrival order. Throwing here is swallowed
   *  so one bad consumer callback cannot break the stream. */
  onChunk?: (text: string) => void;
  /** Cancel from the caller side — tab closed, user pressed Stop. */
  signal?: AbortSignal;
  /** Inactivity bound in ms: reset on every chunk, so a long tool-running turn
   *  that keeps streaming stays alive while a dead bridge still settles. 0 =
   *  no timeout. Defaults to the invoke timeout. */
  timeoutMs?: number;
}

/** Terminal value of a completed stream. */
export interface StreamResult<T = any> {
  /** The concatenation of every chunk delivered. */
  text: string;
  /** Whatever the host attached to MNEMO_PLUGIN_DONE (e.g. `{ reply }`). */
  data?: T;
}

// ── Design bridge — inherit the host shell's look ──────────────────────────────

/**
 * One MNEMO_CONFIG_UPDATE from the host shell. Sent on load and again on every
 * host-side change (theme flip, language change, the user picking a custom
 * accent or panel color in Settings → Appearance).
 */
export interface MnemoHostConfig {
  theme?: 'dark' | 'light';
  lang?: string;
  /**
   * The shell's LIVE design tokens: every CSS custom property of the host
   * theme, COMPUTED — theme values and the user's Appearance overrides already
   * resolved. Keys are the shell's own variable names (`--accent`,
   * `--accent-violet`, `--bg-panel`, `--text-primary`, `--border-subtle`, …),
   * so a cartridge styled with `var(--accent)` renders in the user's accent.
   */
  tokens?: Record<string, string>;
  /**
   * The canvas zoom this cartridge is being painted at, quantised to steps of
   * 0.05. A cartridge cannot measure this on its own: the plane is CSS-scaled
   * around the iframe, so `innerWidth` keeps reporting the full size while the
   * pixels shrink. Use it to render a legible summary when the shell is zoomed
   * out and the normal layout would be unreadable. Absent means "unknown" —
   * render the normal view, never a degraded one on a guess.
   */
  zoom?: number;
  /**
   * The version of this cartridge the host has INSTALLED, read from the
   * installed manifest (doc 142). Show it in a badge. Absent on an older host:
   * fall back to the version your bundle was built with.
   */
  version?: string;
  /**
   * What the host knows about a newer version of THIS cartridge (doc 142). The
   * host asks at most once a day, with the same rules as the Hub: the version
   * is read where an install would take it, from the source recorded at
   * install. Absent = not asked (a dev or linked copy, an older host).
   *
   * 🎭 `unknown` is never « up to date »: draw nothing extra for it.
   */
  update?: MnemoUpdateState;
}

/** The host's answer about a newer version of the cartridge (doc 142 §4.1). */
export type MnemoUpdateState =
  | { state: 'newer'; latestVersion: string; checkedAt: string; critical?: boolean }
  | { state: 'current'; checkedAt: string }
  | { state: 'unknown'; reason: string };

/** Writes host design tokens onto this document's `<html>` as inline custom
 *  properties, so every `var(--…)` in the cartridge resolves to the shell's
 *  live value. Non-`--` keys are ignored. */
export function applyDesignTokens(tokens: Record<string, string>): void {
  const root = document.documentElement.style;
  for (const [key, value] of Object.entries(tokens)) {
    if (key.startsWith('--')) root.setProperty(key, value);
  }
}

/**
 * Subscribes to the host's config broadcasts. By default it also APPLIES them:
 * `data-theme` lands on `<html>` and the design tokens land as inline custom
 * properties — one call in your entrypoint and the cartridge follows the
 * shell's theme AND the user's custom colors, live. Pass `{ apply: false }`
 * to only observe. Returns an unsubscribe.
 *
 * @example
 * // main.tsx
 * onHostConfig();                       // just inherit the host look
 * onHostConfig(cfg => setLang(cfg.lang)); // and react to language changes
 */
export function onHostConfig(
  cb?: (config: MnemoHostConfig) => void,
  opts: { apply?: boolean } = {},
): () => void {
  const apply = opts.apply !== false;
  const listener = (event: MessageEvent) => {
    // SECURITY: only the host frame (our parent) may configure us.
    if (event.source !== window.parent) return;
    const d = event.data;
    if (!d || d.type !== 'MNEMO_CONFIG_UPDATE') return;
    if (apply) {
      if (d.theme) document.documentElement.setAttribute('data-theme', d.theme);
      if (d.tokens) applyDesignTokens(d.tokens);
    }
    // Every field of MnemoHostConfig has to be forwarded here. `zoom` was added
    // to the type and to the host's broadcast but not to this line, so it was
    // dropped in transit and the feature could never fire — a declared field
    // that never arrives is worse than an absent one, because it looks done.
    cb?.({ theme: d.theme, lang: d.lang, tokens: d.tokens, zoom: d.zoom, version: d.version, update: d.update });
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

/* eslint-disable @typescript-eslint/no-explicit-any --
 * The loose wrappers deliberately return `any`: this package replaces ten
 * historical per-app copies whose contract WAS `Promise<any>`, and tightening
 * to `unknown` broke their call sites. Precisely-shaped envelopes are typed;
 * the rest stays `any` until the host actions publish response schemas. */

// ── Gestures (doc 106 §32) ─────────────────────────────────────────────────

/** The standard gestures a cartridge may take, declared in its manifest's
 *  `gestures.takes`. The OS gestures (move by the corner, full screen,
 *  close, the pad) are never in this list: a cartridge cannot take them. */
export type MnemoGestureName = 'orbit' | 'pan' | 'depth' | 'zoom' | 'recenter' | 'point' | 'select' | 'next' | 'prev';

/** One gesture step, as the host sends it. Distances are px of the cartridge. */
export type MnemoGesture =
  | { kind: 'orbit'; dx: number; dy: number }
  | { kind: 'pan'; dx: number; dy: number }
  | { kind: 'depth'; factor: number }
  | { kind: 'zoom'; factor: number }
  | { kind: 'recenter' }
  /** Where the index aims in your page, in its px; null when the aim left it. */
  | { kind: 'point'; x: number | null; y: number | null }
  | { kind: 'select'; x: number; y: number }
  | { kind: 'next' }
  | { kind: 'prev' }
  /** A pose the person taught for one of your `gestures.actions`, held. */
  | { kind: 'action'; id: string };

/** One handler per gesture you take. A gesture you did not declare never arrives. */
export type MnemoGestureHandlers = {
  [K in MnemoGesture['kind']]?: (g: Extract<MnemoGesture, { kind: K }>) => void;
};

export interface MnemoGestureSubscription {
  /** Resolves with the gestures the host will send once it granted them;
   *  rejects with the reason it refused (permission denied, a manifest
   *  without `gestures.takes`, no host). */
  ready: Promise<{ takes: MnemoGestureName[]; actions: string[] }>;
  /** Stop receiving. Safe to call more than once. */
  off: () => void;
}

/** One hand-to-mouth contact (doc 139 §5): when it began (epoch ms) and how
 *  long the hand stayed at the mouth (ms). Nothing else leaves the host. */
export interface MnemoMouthContact {
  at: number;
  ms: number;
}

export interface MnemoMouthSubscription {
  /** Resolves once the host granted it, with whether the camera is on now;
   *  rejects with the reason it refused (no `camera:observe`, denied, no host). */
  ready: Promise<{ camera: boolean }>;
  /** Stop receiving. Safe to call more than once. */
  off: () => void;
}

const GESTURE_KINDS: readonly string[] =['orbit', 'pan', 'depth', 'zoom', 'recenter', 'point', 'select', 'next', 'prev', 'action'];

export class MnemoCartridgeSDK {
  private pluginId: string;

  constructor(pluginId: string) {
    this.pluginId = pluginId;
  }

  /**
   * Invokes a host-level system API action safely.
   * `timeoutMs` bounds how long we wait for the host reply (0 = no timeout — reserve
   * that for user-paced actions like OS file dialogs, which stay open indefinitely).
   */
  public invoke<T = any>(action: string, payload?: unknown, timeoutMs: number = DEFAULT_INVOKE_TIMEOUT_MS): Promise<T> {
    return new Promise((resolve, reject) => {
      // Not embedded → there is no host to answer, ever. Fail NOW with the real
      // reason instead of letting the caller stare at a minutes-long timeout
      // (standalone `pnpm dev` in a plain browser tab is the common case).
      if (window.parent === window) {
        reject(new Error(`No Mnemosyne host: "${action}" was invoked outside the shell (this page is not embedded in a host iframe).`));
        return;
      }
      const messageId = Math.random().toString(36).substring(7);
      let timer: number | undefined;
      let settled = false;

      // Single exit: both outcomes remove the listener and clear the timer.
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('message', listener);
        if (timer !== undefined) window.clearTimeout(timer);
        fn();
      };

      const listener = (event: MessageEvent) => {
        // SECURITY: only the host frame (our parent) may answer.
        if (event.source !== window.parent) return;
        if (!event.data || event.data.type !== 'MNEMO_PLUGIN_REPLY') return;
        if (event.data.messageId === messageId) {
          settle(() => {
            if (event.data.success) {
              resolve(event.data.data as T);
            } else {
              reject(new Error(event.data.error || 'Unknown host error'));
            }
          });
        }
      };

      window.addEventListener('message', listener);
      if (timeoutMs > 0) {
        timer = window.setTimeout(
          () => settle(() => reject(new Error(`Host did not reply to "${action}" within ${Math.round(timeoutMs / 1000)}s`))),
          timeoutMs
        );
      }

      window.parent.postMessage(
        { type: 'MNEMO_PLUGIN_REQUEST', pluginId: this.pluginId, messageId, action, payload },
        MNEMO_HOST_ORIGIN
      );
    });
  }

  /**
   * The streaming sibling of {@link invoke}: the host runs the same whitelisted
   * action, under the same spoof + permission checks, but pushes its output
   * incrementally instead of one buffered reply. Reuses the existing host→iframe
   * push machinery (the MNEMO_PLUGIN_* postMessage channel), correlated by a
   * fresh `messageId` so two concurrent streams never interleave.
   *
   * Resolves with the accumulated text (and any terminal `data`) on
   * MNEMO_PLUGIN_DONE; rejects on MNEMO_PLUGIN_ERROR or abort. An action that
   * does not stream still resolves here — the caller simply receives no chunks.
   *
   * @example
   * const ctrl = new AbortController();
   * const { text } = await sdk.stream('hermes.chatStream', { messages }, {
   *   onChunk: (t) => appendToBubble(t),
   *   signal: ctrl.signal,
   * });
   */
  public stream<T = any>(action: string, payload?: unknown, opts: StreamOptions = {}): Promise<StreamResult<T>> {
    const { onChunk, signal } = opts;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_INVOKE_TIMEOUT_MS;

    return new Promise<StreamResult<T>>((resolve, reject) => {
      // No host to stream from — fail now, not after a long timeout.
      if (window.parent === window) {
        reject(new Error(`No Mnemosyne host: "${action}" was streamed outside the shell (this page is not embedded in a host iframe).`));
        return;
      }
      // Already cancelled before we even started.
      if (signal?.aborted) {
        reject(abortReason(signal));
        return;
      }

      const messageId = newMessageId();
      let full = '';
      let timer: number | undefined;
      let settled = false;

      const clearTimer = () => {
        if (timer !== undefined) { window.clearTimeout(timer); timer = undefined; }
      };
      // Inactivity timer: (re)armed on start and on every chunk, so silence —
      // never a slow-but-alive stream — is what trips it.
      const armTimer = () => {
        if (timeoutMs <= 0) return;
        clearTimer();
        timer = window.setTimeout(
          () => settle(() => reject(new Error(`Host stalled on "${action}" — no chunk within ${Math.round(timeoutMs / 1000)}s`))),
          timeoutMs
        );
      };

      // Single exit: every outcome removes the listener, the abort hook and the timer.
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('message', listener);
        if (signal) signal.removeEventListener('abort', onAbort);
        clearTimer();
        fn();
      };

      const onAbort = () => {
        // Ask the host to stop the upstream work, then reject. Best-effort: if the
        // host is already gone there is nothing left to cancel.
        try {
          window.parent.postMessage(
            { type: 'MNEMO_PLUGIN_CANCEL', pluginId: this.pluginId, messageId },
            MNEMO_HOST_ORIGIN
          );
        } catch { /* host gone — the local settle below is what matters */ }
        settle(() => reject(abortReason(signal)));
      };

      const listener = (event: MessageEvent) => {
        // SECURITY: only the host frame (our parent) may feed this stream.
        if (event.source !== window.parent) return;
        const d = event.data;
        // Correlation: ignore everything not addressed to THIS stream.
        if (!d || d.messageId !== messageId) return;
        switch (d.type) {
          case 'MNEMO_PLUGIN_CHUNK': {
            if (settled) return;
            const text = typeof d.chunk === 'string' ? d.chunk : '';
            if (text) {
              full += text;
              try { onChunk?.(text); } catch (err) { console.error('[MNEMO-SDK] onChunk consumer threw:', err); }
            }
            armTimer(); // activity — push the stall deadline back
            break;
          }
          case 'MNEMO_PLUGIN_DONE':
            settle(() => resolve({ text: full, data: d.data as T }));
            break;
          case 'MNEMO_PLUGIN_ERROR':
            settle(() => reject(new Error(d.error || 'Unknown host stream error')));
            break;
        }
      };

      window.addEventListener('message', listener);
      if (signal) signal.addEventListener('abort', onAbort);
      armTimer();

      window.parent.postMessage(
        { type: 'MNEMO_PLUGIN_REQUEST', pluginId: this.pluginId, messageId, action, payload, stream: true },
        MNEMO_HOST_ORIGIN
      );
    });
  }

  // ── Model ──────────────────────────────────────────────────────────────

  /** Runs an AI completion on the host model router. */
  public inferModel(payload: ModelInferPayload): Promise<ModelInferResult> {
    return this.invoke<ModelInferResult>('model.infer', payload);
  }

  /** Fetches the current host model configuration. */
  /**
   * Opens the Mnemosyne Hub on this cartridge's own page, where its update is
   * offered (doc 142 §4.2). Installs nothing. Ungated; the id comes from the
   * bridge, so a cartridge can only open its own page. `opened: false` when no
   * Hub answered (a cartridge in its own window): tell the person to open the
   * Hub themselves.
   */
  public showUpdateInHub(): Promise<{ opened: boolean }> {
    return this.invoke<{ opened: boolean }>('hub.showUpdate');
  }

  public getModelConfig(): Promise<any> {
    return this.invoke('model.getConfig');
  }

  // ── Mnemosyne memory ───────────────────────────────────────────────────

  /** Host/vault status snapshot. */
  public status(): Promise<any> {
    return this.invoke('mnemosyne.status');
  }

  /** Semantic RAG query over the host memory. */
  public query(queryText: string): Promise<any> {
    return this.invoke('mnemosyne.query', { query: queryText });
  }

  /** Ingests one chronicle into the host memory pipeline. */
  public ingest(content: string, spineType = 'SOCIAL_NODE'): Promise<any> {
    return this.invoke('mnemosyne.ingest', { content, spineType });
  }

  /** Vectorized ingest into a NAMED vault (SHA-256 dedup host-side). */
  public socialIngest(vault: string, content: string, spineType = 'SOCIAL_NODE'): Promise<any> {
    return this.invoke('social.ingest', { vault, content, spineType });
  }

  /** Raw chronicle read from a NAMED vault (no LLM). */
  public socialQuery(vault: string, limit = 100): Promise<any> {
    return this.invoke('social.query', { vault, limit });
  }

  /** Topology map of memory resonances (Neural Map data). */
  public getTopologyMap(opts?: { limit?: number; threshold?: number; vaultIds?: string[] }): Promise<any> {
    return this.invoke('getTopologyMap', opts);
  }

  /** Standard document metadata for all scanned papers. */
  public getScannedPapers(): Promise<any> {
    return this.invoke('vault.getScannedPapers');
  }

  // ── App sandbox vault (doc 58) ─────────────────────────────────────────

  /**
   * Idempotently creates+mounts this app's OWN walled-off sandbox vault and
   * returns its name — the `vault` to target in socialIngest/socialQuery.
   * Call it once at boot, before any ingest. The vault starts isolated
   * (no federated RAG, no neural map, no Dream State) until the HUMAN
   * unlocks permanence from the host's Vault Pad.
   */
  public ensureSandbox(): Promise<{ vault: string; created: boolean; unlocked: boolean }> {
    return this.invoke('vault.sandbox.ensure', {});
  }

  /**
   * Declares how the host renders this app's vault tile. The HOST computes
   * each metric's number from the vault's spine stats — the tile stays alive
   * even when the app is closed.
   *
   * @example
   * await sdk.describeVaultTile({
   *   icon: '🏝️',
   *   metrics: [{ label: 'Contacts', spine: 'SOCIAL_CONTACT' }],
   * });
   */
  public describeVaultTile(tile: VaultTileDescriptor): Promise<{ tile: unknown }> {
    return this.invoke('vault.sandbox.describeTile', tile);
  }

  // ── Vault / DocWatch ───────────────────────────────────────────────────

  /** Scans the subvault workspace directory hierarchy. */
  public scanTree(): Promise<{ success: boolean; nodes: any[]; error?: string }> {
    return this.invoke('vault.scanTree');
  }

  /** Adds or updates a DocWatch target for a vault. */
  public setDocWatch(vaultDir: string, target: { path: string; enabled: boolean; recursive?: boolean }): Promise<any> {
    return this.invoke('vault.setDocWatch', { path: vaultDir, config: target });
  }

  /** Removes a DocWatch target from a vault. */
  public removeDocWatch(vaultDir: string, watchPath: string): Promise<any> {
    return this.invoke('vault.removeDocWatch', { path: vaultDir, watchPath });
  }

  // ── Dialogs & host filesystem ──────────────────────────────────────────

  /**
   * Opens the OS folder picker and resolves to the chosen path, or null if the
   * user cancels. Note: the host resolves a bare `string | null` — there is no
   * `{ success, path }` envelope. Uses no timeout since the dialog is user-paced.
   */
  public selectFolder(opts?: { startIn?: string }): Promise<string | null> {
    return this.invoke<string | null>('dialog.selectFolder', opts, 0);
  }

  /** Opens the OS file picker (user-paced — no timeout). */
  public selectFile(filters?: any): Promise<any> {
    return this.invoke('dialog.selectFile', { filters }, 0);
  }

  /** Reads a file's content from an absolute path (home-scoped host-side). */
  public readFile(filePath: string): Promise<{ success: boolean; content?: string; isBinary?: boolean; error?: string }> {
    return this.invoke('dialog.readFile', { filePath });
  }

  /** Writes content to an absolute path (home-scoped host-side). */
  public writeFile(filePath: string, content: string): Promise<{ success: boolean; error?: string }> {
    return this.invoke('dialog.writeFile', { filePath, content });
  }

  /** Lists directory entries for a given path. */
  public readDir(dirPath: string): Promise<{ success: boolean; files?: { name: string; isDirectory: boolean; path: string }[]; error?: string }> {
    return this.invoke('dialog.readDir', { dirPath });
  }

  /** Opens a file natively in the OS default application (whitelisted extensions). */
  public openInOS(filePath: string): Promise<{ success: boolean; error?: string }> {
    return this.invoke('dialog.openInOS', { filePath });
  }

  /**
   * Recursively deletes a PROJECT folder your cartridge scaffolded.
   *
   * The one destructive filesystem call, and the most fenced: home-scoped,
   * never the home root nor a direct child of it, and the folder MUST carry a
   * project manifest (`app-spec.json` / `mnemo-plugin.json` / `BRIEF.md`) —
   * without one the host refuses (`NOT_A_PROJECT`), because it is then somebody's
   * ordinary folder. Collect the human's explicit confirmation FIRST: there is
   * no trash can, and the host will not ask on your behalf.
   */
  public deleteProjectDir(dirPath: string): Promise<{ success: boolean; error?: string }> {
    return this.invoke('dialog.deleteProjectDir', { dirPath });
  }

  // ── Your sandbox ───────────────────────────────────────────────────────

  /**
   * Forgets specific chronicles YOUR app wrote in its own sandbox — what an app
   * needs to offer "delete this entry" without wiping its whole vault. The ids
   * come from the rows returned by {@link socialQuery}. The app id is bound
   * host-side, so this can only ever reach your own store. Irreversible.
   */
  public forgetSandbox(ids: number[]): Promise<{ success: boolean; forgotten?: number; error?: string }> {
    return this.invoke('vault.sandbox.forget', { ids });
  }

  // ── Dev cartridges (builder apps) ──────────────────────────────────────

  /** Cartridge folders currently dev-linked (yours and the user's). */
  public getLinkedDev(): Promise<{ success: boolean; data?: LinkedDevCartridge[]; error?: string }> {
    return this.invoke('plugins.getLinkedDev');
  }

  /**
   * Links a LOCAL folder as a dev cartridge so it can be launched in its own
   * Mnemosyne window. The folder needs a valid `mnemo-plugin.json`; the host
   * refuses id conflicts, and the 2nd+ link needs the `dev.linkExtra` license
   * (`DEV_LINK_LICENSE_REQUIRED`) — unlink one of yours to free the slot.
   */
  public linkDev(dirPath: string): Promise<{ success: boolean; id?: string; error?: string }> {
    return this.invoke('plugins.linkDev', { dirPath });
  }

  /** Unlinks a dev cartridge folder. Never touches the folder itself. */
  public unlinkDev(dirPath: string): Promise<{ success: boolean; error?: string }> {
    return this.invoke('plugins.unlinkDev', { dirPath });
  }

  /** Opens an installed/linked cartridge in its own window. */
  public launchPlugin(id: string): Promise<{ success: boolean; error?: string }> {
    return this.invoke('plugins.launch', { id });
  }

  // ── Gestures (doc 106 §32) ─────────────────────────────────────────────

  /**
   * Receive the hand gestures the person makes while your cartridge is in
   * front (in full screen). Declare them first in `mnemo-plugin.json`:
   *
   * ```json
   * "permissions": ["gesture:receive"],
   * "gestures": {
   *   "takes": ["orbit", "depth", "zoom", "recenter"],
   *   "actions": [{ "id": "explode", "label": { "en": "Exploded view" } }]
   * }
   * ```
   *
   * An action in `actions` appears in the person's « My gestures » under your
   * app's name. The person teaches its pose there; you receive
   * `{ kind: 'action', id }` when that pose is held while your app is in front.
   *
   * The host asks the person once for `gesture:receive`. Your cartridge
   * never sees the camera nor the hand: it receives intentions, such as
   * « turn by 12 px » or « come closer by 3 % ».
   *
   * @example
   * const sub = sdk.onGestures({
   *   orbit: ({ dx, dy }) => model.rotate(dx, dy),
   *   depth: ({ factor }) => camera.dolly(factor),
   *   recenter: () => camera.reset(),
   * });
   * sub.ready.catch(err => showHint(err.message));
   * // later: sub.off();
   */
  public onGestures(handlers: MnemoGestureHandlers, timeoutMs: number = DEFAULT_INVOKE_TIMEOUT_MS): MnemoGestureSubscription {
    const requestId = Math.random().toString(36).substring(7);
    let stopped = false;
    let timer: number | undefined;
    let settle: { resolve: (v: { takes: MnemoGestureName[]; actions: string[] }) => void; reject: (e: Error) => void } | null = null;
    const ready = new Promise<{ takes: MnemoGestureName[]; actions: string[] }>((resolve, reject) => { settle = { resolve, reject }; });
    // A subscription nobody awaits must not turn a refusal into an
    // unhandled rejection; the caller still sees it through `ready`.
    ready.catch(() => undefined);

    const finish = (fn: (s: NonNullable<typeof settle>) => void) => {
      if (timer !== undefined) { window.clearTimeout(timer); timer = undefined; }
      const s = settle;
      settle = null;
      if (s) fn(s);
    };

    const listener = (event: MessageEvent) => {
      // SECURITY: only the host frame (our parent) may send gestures.
      if (event.source !== window.parent) return;
      const d = event.data;
      if (!d || typeof d.type !== 'string') return;
      if (d.type === 'MNEMO_GESTURE_READY' && d.requestId === requestId) {
        const takes = Array.isArray(d.takes) ? d.takes.filter((k: unknown) => typeof k === 'string' && GESTURE_KINDS.includes(k)) : [];
        const actions = Array.isArray(d.actions) ? d.actions.filter((a: unknown) => typeof a === 'string') : [];
        finish(s => s.resolve({ takes, actions }));
        return;
      }
      if (d.type === 'MNEMO_GESTURE_REFUSED' && d.requestId === requestId) {
        window.removeEventListener('message', listener);
        finish(s => s.reject(new Error(typeof d.error === 'string' ? d.error : 'The host refused the gestures')));
        return;
      }
      if (d.type === 'MNEMO_GESTURE' && d.requestId === requestId && !stopped) {
        const g = d.gesture as MnemoGesture | undefined;
        if (!g || !GESTURE_KINDS.includes(g.kind)) return;
        const handler = handlers[g.kind] as ((x: MnemoGesture) => void) | undefined;
        if (!handler) return;
        try {
          handler(g);
        } catch (err) {
          console.error(`[MnemoCartridgeSDK] the "${g.kind}" gesture handler threw:`, err);
        }
      }
    };

    const off = () => {
      if (stopped) return;
      stopped = true;
      window.removeEventListener('message', listener);
      finish(s => s.reject(new Error('Gestures were turned off before the host answered')));
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'MNEMO_GESTURE_UNSUBSCRIBE', pluginId: this.pluginId, requestId }, MNEMO_HOST_ORIGIN);
      }
    };

    if (window.parent === window) {
      stopped = true;
      finish(s => s.reject(new Error('No Mnemosyne host: gestures were asked outside the shell (this page is not embedded in a host iframe).')));
      return { ready, off };
    }

    window.addEventListener('message', listener);
    if (timeoutMs > 0) {
      timer = window.setTimeout(
        () => finish(s => s.reject(new Error(`Host did not answer the gesture request within ${Math.round(timeoutMs / 1000)}s`))),
        timeoutMs,
      );
    }
    window.parent.postMessage({ type: 'MNEMO_GESTURE_SUBSCRIBE', pluginId: this.pluginId, requestId }, MNEMO_HOST_ORIGIN);
    return { ready, off };
  }

  /**
   * Hand-to-mouth contacts seen by the host camera (doc 139 §5). Needs
   * `camera:observe` in the manifest's `permissions`; the host asks the
   * person once, in its own dialog.
   *
   * The cartridge never sees the camera, an image or a hand. It receives one
   * {@link MnemoMouthContact} per contact (a hand held at the mouth for a
   * moment), and judges for itself what a series of them means. Contacts
   * arrive whether or not the cartridge's window is in front, while that
   * window is open. The camera only runs while the person has turned it on
   * in Settings › Gestures: `onCamera` says when that changes.
   */
  public onMouthWatch(
    handlers: { contact: (c: MnemoMouthContact) => void; onCamera?: (on: boolean) => void },
    timeoutMs: number = DEFAULT_INVOKE_TIMEOUT_MS,
  ): MnemoMouthSubscription {
    const requestId = Math.random().toString(36).substring(7);
    let stopped = false;
    let timer: number | undefined;
    let settle: { resolve: (v: { camera: boolean }) => void; reject: (e: Error) => void } | null = null;
    const ready = new Promise<{ camera: boolean }>((resolve, reject) => { settle = { resolve, reject }; });
    ready.catch(() => undefined);

    const finish = (fn: (s: NonNullable<typeof settle>) => void) => {
      if (timer !== undefined) { window.clearTimeout(timer); timer = undefined; }
      const s = settle;
      settle = null;
      if (s) fn(s);
    };

    const listener = (event: MessageEvent) => {
      // SECURITY: only the host frame (our parent) may send observations.
      if (event.source !== window.parent) return;
      const d = event.data;
      if (!d || typeof d.type !== 'string' || d.requestId !== requestId) return;
      if (d.type === 'MNEMO_MOUTH_READY') {
        finish(s => s.resolve({ camera: d.camera === true }));
      } else if (d.type === 'MNEMO_MOUTH_REFUSED') {
        window.removeEventListener('message', listener);
        finish(s => s.reject(new Error(typeof d.error === 'string' ? d.error : 'The host refused the camera observation')));
      } else if (d.type === 'MNEMO_MOUTH_CAMERA' && !stopped) {
        try { handlers.onCamera?.(d.camera === true); } catch (err) { console.error('[MnemoCartridgeSDK] the onCamera handler threw:', err); }
      } else if (d.type === 'MNEMO_MOUTH_CONTACT' && !stopped) {
        const c = d.contact as MnemoMouthContact | undefined;
        if (!c || !Number.isFinite(c.at) || !Number.isFinite(c.ms)) return;
        try { handlers.contact({ at: c.at, ms: c.ms }); } catch (err) { console.error('[MnemoCartridgeSDK] the contact handler threw:', err); }
      }
    };

    const off = () => {
      if (stopped) return;
      stopped = true;
      window.removeEventListener('message', listener);
      finish(s => s.reject(new Error('The observation was turned off before the host answered')));
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'MNEMO_MOUTH_UNSUBSCRIBE', pluginId: this.pluginId, requestId }, MNEMO_HOST_ORIGIN);
      }
    };

    if (window.parent === window) {
      stopped = true;
      finish(s => s.reject(new Error('No Mnemosyne host: the camera observation was asked outside the shell.')));
      return { ready, off };
    }

    window.addEventListener('message', listener);
    if (timeoutMs > 0) {
      timer = window.setTimeout(
        () => finish(s => s.reject(new Error(`Host did not answer the camera observation request within ${Math.round(timeoutMs / 1000)}s`))),
        timeoutMs,
      );
    }
    window.parent.postMessage({ type: 'MNEMO_MOUTH_SUBSCRIBE', pluginId: this.pluginId, requestId }, MNEMO_HOST_ORIGIN);
    return { ready, off };
  }

  // ── System ─────────────────────────────────────────────────────────────

  /** Host system metrics (CPU/RAM/GPU snapshot). */
  public getSystemMetrics(): Promise<any> {
    return this.invoke('metrics.get');
  }

  /**
   * The user's OWN credit balance (Mnemosyne Cloud). Snapshot `usedUsdMicro`
   * around a generation and diff it to report what that generation actually
   * cost — the metered amount, never an estimate.
   *
   * Only the Mnemosyne Cloud route is metered: local inference costs nothing,
   * and a personal API key is billed by the provider, which the host never
   * sees. Say which of the two applies instead of showing a misleading 0.
   */
  public creditsStatus(): Promise<{ success: boolean; data?: CreditBalanceView; error?: string }> {
    return this.invoke('credits.status');
  }
}
