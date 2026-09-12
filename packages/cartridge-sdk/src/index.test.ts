import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MnemoCartridgeSDK, applyDesignTokens, onHostConfig } from './index.js';

describe('applyDesignTokens', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('style');
  });

  it('writes each --prefixed token as an inline custom property on <html>', () => {
    applyDesignTokens({ '--accent': '#7c4dff', '--bg-panel': '#101014' });
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#7c4dff');
    expect(document.documentElement.style.getPropertyValue('--bg-panel')).toBe('#101014');
  });

  it('ignores keys that do not start with "--" (never a stray CSS property)', () => {
    applyDesignTokens({ color: 'red', '--ok': '1px' } as Record<string, string>);
    expect(document.documentElement.style.getPropertyValue('--ok')).toBe('1px');
    expect(document.documentElement.style.color).toBe('');
  });
});

describe('onHostConfig', () => {
  // Every subscription made through `subscribe()` below is unsubscribed here.
  // onHostConfig() attaches a real `window.addEventListener('message', …)`,
  // so a test that forgets to unsubscribe leaks a listener that keeps
  // reacting to every later test's postFromHost() calls — the failure mode
  // this fixture exists to rule out (`subscribe` is used for exactly this).
  let unsubs: Array<() => void>;

  beforeEach(() => {
    unsubs = [];
  });

  afterEach(() => {
    for (const unsub of unsubs) unsub();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('style');
  });

  function subscribe(cb?: Parameters<typeof onHostConfig>[0], opts?: Parameters<typeof onHostConfig>[1]): () => void {
    const unsub = onHostConfig(cb, opts);
    unsubs.push(unsub);
    return unsub;
  }

  function postFromHost(data: unknown): void {
    // The listener only trusts messages whose `source` is window.parent — at
    // this top level, jsdom leaves window.parent === window, so a synthetic
    // event sourced from `window` passes the same guard the real host does.
    window.dispatchEvent(new MessageEvent('message', { data, source: window }));
  }

  it('ignores a message whose source is not window.parent', () => {
    const cb = vi.fn();
    subscribe(cb);
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'MNEMO_CONFIG_UPDATE', theme: 'dark' }, source: null }));
    expect(cb).not.toHaveBeenCalled();
  });

  it('ignores messages that are not MNEMO_CONFIG_UPDATE', () => {
    const cb = vi.fn();
    subscribe(cb);
    postFromHost({ type: 'SOMETHING_ELSE' });
    expect(cb).not.toHaveBeenCalled();
  });

  it('applies theme and tokens by default, and forwards every field to the callback', () => {
    const cb = vi.fn();
    subscribe(cb);
    postFromHost({ type: 'MNEMO_CONFIG_UPDATE', theme: 'dark', lang: 'fr', tokens: { '--accent': '#fff' }, zoom: 0.65 });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#fff');
    // Regression: `zoom` was once declared on MnemoHostConfig and broadcast by
    // the host but never forwarded here — a field that never arrives is worse
    // than an absent one because it looks shipped. Assert it makes it through.
    expect(cb).toHaveBeenCalledWith({ theme: 'dark', lang: 'fr', tokens: { '--accent': '#fff' }, zoom: 0.65 });
  });

  it('does not apply theme/tokens when { apply: false }, but still calls back', () => {
    const cb = vi.fn();
    subscribe(cb, { apply: false });
    postFromHost({ type: 'MNEMO_CONFIG_UPDATE', theme: 'dark', tokens: { '--accent': '#f00' } });

    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('the returned unsubscribe stops further callbacks', () => {
    const cb = vi.fn();
    const unsubscribe = subscribe(cb);
    unsubscribe();
    postFromHost({ type: 'MNEMO_CONFIG_UPDATE', theme: 'dark' });
    expect(cb).not.toHaveBeenCalled();
  });

  it('works with no callback at all (apply-only usage)', () => {
    expect(() => subscribe()).not.toThrow();
    expect(() => postFromHost({ type: 'MNEMO_CONFIG_UPDATE', theme: 'light' })).not.toThrow();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});

describe('MnemoCartridgeSDK — not embedded (window.parent === window, jsdom default)', () => {
  it('invoke() rejects immediately with a named error instead of hanging until timeout', async () => {
    const sdk = new MnemoCartridgeSDK('test-plugin');
    await expect(sdk.invoke('mnemosyne.status')).rejects.toThrow(/No Mnemosyne host/);
  });

  it('stream() rejects immediately with the same named error', async () => {
    const sdk = new MnemoCartridgeSDK('test-plugin');
    await expect(sdk.stream('hermes.chatStream')).rejects.toThrow(/No Mnemosyne host/);
  });
});

/**
 * MnemoCartridgeSDK.invoke()/stream() talk to the host frame over
 * window.parent.postMessage. jsdom's top-level document has
 * window.parent === window, which the SDK reads as "no host" — so, like
 * apps/infinity-edition's cartridgeSdkStream.test.ts (the existing coverage
 * for stream()'s lifecycle), we point window.parent at a REAL child iframe's
 * contentWindow: jsdom validates a MessageEvent's `source` as a genuine
 * WindowProxy, so a plain stand-in object is not a safe substitute here.
 */
describe('MnemoCartridgeSDK — embedded', () => {
  let hostWin: Window;
  let postSpy: ReturnType<typeof vi.spyOn>;
  let parentDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    hostWin = frame.contentWindow as Window;
    postSpy = vi.spyOn(hostWin, 'postMessage').mockImplementation(() => {});
    parentDescriptor = Object.getOwnPropertyDescriptor(window, 'parent');
    Object.defineProperty(window, 'parent', { configurable: true, get: () => hostWin });
  });

  afterEach(() => {
    if (parentDescriptor) Object.defineProperty(window, 'parent', parentDescriptor);
    else delete (window as unknown as { parent?: unknown }).parent;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function lastRequest(): { pluginId: string; messageId: string; action: string; payload: unknown; stream?: boolean } {
    const call = postSpy.mock.calls[postSpy.mock.calls.length - 1];
    return call![0] as never;
  }

  function replyToLast(overrides: Record<string, unknown>): void {
    const req = lastRequest();
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'MNEMO_PLUGIN_REPLY', messageId: req.messageId, ...overrides },
      source: hostWin,
    }));
  }

  describe('invoke()', () => {
    it('posts a well-formed MNEMO_PLUGIN_REQUEST and resolves with the reply data', async () => {
      const sdk = new MnemoCartridgeSDK('my-plugin');
      const pending = sdk.invoke('mnemosyne.status', { verbose: true });
      const req = lastRequest();
      expect(req.pluginId).toBe('my-plugin');
      expect(req.action).toBe('mnemosyne.status');
      expect(req.payload).toEqual({ verbose: true });

      replyToLast({ success: true, data: { ok: true } });
      await expect(pending).resolves.toEqual({ ok: true });
    });

    it('rejects with the host-provided error on a failed reply', async () => {
      const sdk = new MnemoCartridgeSDK('my-plugin');
      const pending = sdk.invoke('dialog.readFile', { filePath: '/x' });
      replyToLast({ success: false, error: 'NOT_A_PROJECT' });
      await expect(pending).rejects.toThrow('NOT_A_PROJECT');
    });

    it('falls back to a generic message when the host omits an error string', async () => {
      const sdk = new MnemoCartridgeSDK('my-plugin');
      const pending = sdk.invoke('dialog.readFile');
      replyToLast({ success: false });
      await expect(pending).rejects.toThrow('Unknown host error');
    });

    it('ignores a reply whose messageId does not match (two concurrent calls never cross)', async () => {
      const sdk = new MnemoCartridgeSDK('my-plugin');
      const first = sdk.invoke('a.action');
      const firstReq = lastRequest();
      const second = sdk.invoke('b.action');

      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'MNEMO_PLUGIN_REPLY', messageId: firstReq.messageId, success: true, data: 'first' },
        source: hostWin,
      }));
      await expect(first).resolves.toBe('first');

      replyToLast({ success: true, data: 'second' });
      await expect(second).resolves.toBe('second');
    });

    it('ignores a reply "spoofed" from a frame that is not the host', async () => {
      const sdk = new MnemoCartridgeSDK('my-plugin');
      const pending = sdk.invoke('mnemosyne.status');
      const req = lastRequest();

      const evil = document.createElement('iframe');
      document.body.appendChild(evil);
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'MNEMO_PLUGIN_REPLY', messageId: req.messageId, success: true, data: 'forged' },
        source: evil.contentWindow as Window,
      }));

      replyToLast({ success: true, data: 'real' });
      await expect(pending).resolves.toBe('real');
    });

    it('times out with a named error when the host never replies', async () => {
      vi.useFakeTimers();
      const sdk = new MnemoCartridgeSDK('my-plugin');
      const pending = sdk.invoke('mnemosyne.status', undefined, 1000);
      const assertion = expect(pending).rejects.toThrow(/did not reply.*1s/);
      await vi.advanceTimersByTimeAsync(1001);
      await assertion;
    });

    it('timeoutMs: 0 means no timeout is armed (user-paced dialogs)', async () => {
      vi.useFakeTimers();
      const sdk = new MnemoCartridgeSDK('my-plugin');
      const pending = sdk.selectFolder();
      await vi.advanceTimersByTimeAsync(10 * 60_000); // 10 real minutes of fake time
      replyToLast({ success: true, data: '/chosen/dir' });
      await expect(pending).resolves.toBe('/chosen/dir');
    });
  });

  describe('stream() — package-level smoke coverage (full lifecycle is pinned by apps/infinity-edition/src/test/cartridgeSdkStream.test.ts)', () => {
    it('accumulates chunks in order and resolves with the full text plus terminal data', async () => {
      const sdk = new MnemoCartridgeSDK('my-plugin');
      const chunks: string[] = [];
      const pending = sdk.stream('hermes.chatStream', { messages: [] }, { onChunk: (t) => chunks.push(t) });
      const req = lastRequest();
      expect(req.stream).toBe(true);

      const emit = (data: Record<string, unknown>) => window.dispatchEvent(new MessageEvent('message', {
        data: { messageId: req.messageId, ...data },
        source: hostWin,
      }));

      emit({ type: 'MNEMO_PLUGIN_CHUNK', chunk: 'Hello, ' });
      emit({ type: 'MNEMO_PLUGIN_CHUNK', chunk: 'world!' });
      emit({ type: 'MNEMO_PLUGIN_DONE', data: { reply: { id: 1 } } });

      const result = await pending;
      expect(result.text).toBe('Hello, world!');
      expect(result.data).toEqual({ reply: { id: 1 } });
      expect(chunks).toEqual(['Hello, ', 'world!']);
    });

    it('rejects on MNEMO_PLUGIN_ERROR — a truncated stream never resolves as if complete', async () => {
      const sdk = new MnemoCartridgeSDK('my-plugin');
      const pending = sdk.stream('hermes.chatStream');
      const req = lastRequest();
      window.dispatchEvent(new MessageEvent('message', {
        data: { messageId: req.messageId, type: 'MNEMO_PLUGIN_ERROR', error: 'UPSTREAM_TIMEOUT' },
        source: hostWin,
      }));
      await expect(pending).rejects.toThrow('UPSTREAM_TIMEOUT');
    });

    it('an inactivity timeout fires when no chunk arrives in time, even after an earlier chunk', async () => {
      vi.useFakeTimers();
      const sdk = new MnemoCartridgeSDK('my-plugin');
      const pending = sdk.stream('hermes.chatStream', {}, { timeoutMs: 1000 });
      const req = lastRequest();
      window.dispatchEvent(new MessageEvent('message', {
        data: { messageId: req.messageId, type: 'MNEMO_PLUGIN_CHUNK', chunk: 'partial' },
        source: hostWin,
      }));
      const assertion = expect(pending).rejects.toThrow(/stalled/);
      await vi.advanceTimersByTimeAsync(1001);
      await assertion;
    });
  });

  describe('convenience wrappers map to the documented host action + payload shape', () => {
    it.each([
      ['inferModel', [{ prompt: 'hi' }], 'model.infer', { prompt: 'hi' }],
      ['query', ['find x'], 'mnemosyne.query', { query: 'find x' }],
      ['ingest', ['some text'], 'mnemosyne.ingest', { content: 'some text', spineType: 'SOCIAL_NODE' }],
      ['ingest', ['some text', 'NOTE'], 'mnemosyne.ingest', { content: 'some text', spineType: 'NOTE' }],
      ['socialIngest', ['APP-x', 'hi', 'SOCIAL_NODE'], 'social.ingest', { vault: 'APP-x', content: 'hi', spineType: 'SOCIAL_NODE' }],
      ['socialQuery', ['APP-x'], 'social.query', { vault: 'APP-x', limit: 100 }],
      ['ensureSandbox', [], 'vault.sandbox.ensure', {}],
      ['describeVaultTile', [{ icon: '🏝️' }], 'vault.sandbox.describeTile', { icon: '🏝️' }],
      ['launchPlugin', ['app-id'], 'plugins.launch', { id: 'app-id' }],
      ['forgetSandbox', [[1, 2, 3]], 'vault.sandbox.forget', { ids: [1, 2, 3] }],
    ] as const)('%s(...) → invoke(%j, %j)', async (method, args, expectedAction, expectedPayload) => {
      const sdk = new MnemoCartridgeSDK('my-plugin');
      const spy = vi.spyOn(sdk, 'invoke').mockResolvedValue({ success: true } as never);
      // @ts-expect-error — dynamic dispatch across a tuple of differently-typed methods; not typechecked (test files are excluded from `pnpm typecheck`, matching the sibling packages' pattern).
      await sdk[method](...args);
      expect(spy).toHaveBeenCalledWith(expectedAction, expectedPayload);
    });

    // These wrappers call invoke(action) with NO second argument at all — not
    // even an explicit `undefined` — so they get their own assertion instead
    // of joining the table above (toHaveBeenCalledWith is arity-sensitive:
    // `(action)` and `(action, undefined)` are different call shapes).
    it.each([
      ['getModelConfig', 'model.getConfig'],
      ['status', 'mnemosyne.status'],
      ['scanTree', 'vault.scanTree'],
      ['getLinkedDev', 'plugins.getLinkedDev'],
      ['getSystemMetrics', 'metrics.get'],
      ['creditsStatus', 'credits.status'],
    ] as const)('%s() → invoke(%j) with no payload argument', async (method, expectedAction) => {
      const sdk = new MnemoCartridgeSDK('my-plugin');
      const spy = vi.spyOn(sdk, 'invoke').mockResolvedValue({ success: true } as never);
      await sdk[method]();
      expect(spy).toHaveBeenCalledWith(expectedAction);
      expect(spy.mock.calls[0]).toHaveLength(1);
    });

    it('selectFolder() and selectFile() use timeoutMs: 0 (user-paced OS dialogs)', async () => {
      const sdk = new MnemoCartridgeSDK('my-plugin');
      const spy = vi.spyOn(sdk, 'invoke').mockResolvedValue(null as never);
      await sdk.selectFolder({ startIn: '/home' });
      expect(spy).toHaveBeenCalledWith('dialog.selectFolder', { startIn: '/home' }, 0);
      await sdk.selectFile({ extensions: ['.pdf'] });
      expect(spy).toHaveBeenCalledWith('dialog.selectFile', { filters: { extensions: ['.pdf'] } }, 0);
    });
  });
});
