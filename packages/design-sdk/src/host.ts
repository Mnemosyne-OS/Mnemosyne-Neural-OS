/**
 * host.ts — how a skin's tokens meet the Mnemosyne OS host inside a cartridge.
 *
 * A cartridge that calls `onHostConfig()` (@mnemosyne_os/cartridge-sdk) gets
 * every CSS variable of the user's theme written inline on its <html>. Eight
 * of them carry the same name as a skin token, so they follow the theme with
 * no work. Nine more exist in the host under another name: a kit writes them
 * as `var(--host-name, <skin value>)`, which reads the host's value inside
 * Mnemosyne OS and the skin's value anywhere else.
 *
 * The host uses border tokens as COLOURS (`1px solid var(--border-subtle)`),
 * so a skin gives `--border-subtle` and `--border-accent` a colour too.
 *
 * Radius, spacing, fonts and transitions have no host equivalent: they belong
 * to the app and keep the skin's value.
 */

/** Skin tokens that share their name with a host variable. */
export const HOST_SHARED_TOKENS: readonly string[] = [
  '--accent',
  '--bg-void',
  '--bg-surface',
  '--bg-panel',
  '--text-primary',
  '--text-secondary',
  '--text-muted',
  '--border-subtle',
];

/** The host variable a skin token reads first inside a cartridge. */
export const HOST_TOKEN_SOURCES: Readonly<Record<string, string>> = {
  '--accent-glow': '--accent-soft',
  '--bg-hover': '--bg-surface-hover',
  '--bg-card': '--bg-panel',
  '--text-accent': '--accent',
  '--border-accent': '--border-active',
  '--shadow-card': '--shadow-widget',
  '--status-active': '--accent-success-text',
  '--status-warning': '--accent-warning-text',
  '--status-overload': '--accent-danger-text',
};

/** The value to write for `token` in a kit: the host variable first when there is one. */
export function withHostFallback(token: string, value: string): string {
  const source = HOST_TOKEN_SOURCES[token];
  return source ? `var(${source}, ${value})` : value;
}
