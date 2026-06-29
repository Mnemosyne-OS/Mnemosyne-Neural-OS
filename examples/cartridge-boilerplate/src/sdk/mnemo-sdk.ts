/**
 * Mnemosyne OS Cartridge SDK (TypeScript)
 * Secure communication bridge over window.parent.postMessage
 */

export interface ModelInferPayload {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

/**
 * Best-effort host origin for a targeted postMessage — never broadcast to '*'.
 * The cartridge runs in an iframe whose parent is the trusted host shell; we
 * restrict to its concrete origin and fall back to '*' only for opaque/file://
 * hosts so delivery never breaks (the host also validates event.source).
 */
function resolveHostOrigin(): string {
  const usable = (o: string | null | undefined): o is string => !!o && o !== 'null' && o !== 'file://';
  try { const ao = window.location.ancestorOrigins?.[0]; if (usable(ao)) return ao; } catch { /* unavailable */ }
  try { if (document.referrer) { const o = new URL(document.referrer).origin; if (usable(o)) return o; } } catch { /* none */ }
  return '*';
}
const MNEMO_HOST_ORIGIN = resolveHostOrigin();

export class MnemoCartridgeSDK {
  private pluginId: string;

  constructor(pluginId: string) {
    this.pluginId = pluginId;
  }

  /**
   * Invokes a host-level system API action safely.
   */
  public invoke<T = any>(action: string, payload?: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const messageId = Math.random().toString(36).substring(7);

      const listener = (event: MessageEvent) => {
        // SECURITY: only the host frame (our parent) may answer.
        if (event.source !== window.parent) return;
        if (!event.data || event.data.type !== 'MNEMO_PLUGIN_REPLY') return;
        if (event.data.messageId === messageId) {
          window.removeEventListener('message', listener);
          if (event.data.success) {
            resolve(event.data.data as T);
          } else {
            reject(new Error(event.data.error || 'Unknown host error'));
          }
        }
      };

      window.addEventListener('message', listener);

      // Relay the call to the host shell
      window.parent.postMessage(
        {
          type: 'MNEMO_PLUGIN_REQUEST',
          pluginId: this.pluginId,
          messageId,
          action,
          payload
        },
        MNEMO_HOST_ORIGIN
      );
    });
  }

  // ── Convenience API Wrappers ──────────────────────────────────────────

  /** Runs an AI completion query on the system router */
  public inferModel(payload: ModelInferPayload): Promise<any> {
    return this.invoke('model.infer', payload);
  }

  /** Fetches current system model configuration */
  public getModelConfig(): Promise<any> {
    return this.invoke('model.getConfig');
  }

  /** Gets standard document metadata for all scanned papers */
  public getScannedPapers(): Promise<any> {
    return this.invoke('vault.getScannedPapers');
  }

  /** Displays folder selector dialog on host OS */
  public selectFolder(): Promise<any> {
    return this.invoke('dialog.selectFolder');
  }
}
