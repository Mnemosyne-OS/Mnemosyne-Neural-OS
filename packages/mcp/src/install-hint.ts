/**
 * What to say when nothing answers on ws://127.0.0.1:7799.
 *
 * This package is a CLIENT. The memory lives in the vaults of the Mnemosyne OS
 * desktop application, on the human's own machine, and this server stores
 * nothing of its own. So "cannot connect" is not a transient network error: the
 * thing that holds the data is not there, and saying only "connection failed"
 * leaves the reader with no next step.
 *
 * This matters more since the MCP directories started listing us: they send
 * people who installed `@mnemosyne_os/mcp` and have never heard of the
 * application. The refusal has to say where to get it and WHY it is needed.
 *
 * 🎭 It must not claim more than it measured. A missing `~/.mnemosyne` is a
 * HINT that the app never ran here, never proof that it is not installed: a
 * fresh install that has never been opened has not created it either, and a
 * portable edition keeps its data elsewhere. Hence three states and three
 * sentences, never two.
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DOWNLOAD_URL = 'https://mnemosyne-os.io/download';

/**
 * The application's own `paths.ts` `mnemosyneDir()`. Mirrored here because the
 * file that already knows it, daemon-widgets.ts, is not in the published tarball.
 */
export function mnemosyneHome(): string {
  return join(homedir(), '.mnemosyne');
}

export type InstallState = 'present' | 'no-trace' | 'unknown';

export function installState(exists: (p: string) => boolean = existsSync): InstallState {
  try {
    return exists(mnemosyneHome()) ? 'present' : 'no-trace';
  } catch {
    return 'unknown'; // an unreadable home is an unknown, and an unknown never accuses
  }
}

const WHY =
  'This server holds no data of its own: it relays to the Mnemosyne OS desktop application, which keeps the memory in vaults on this machine.';

/** The sentence to append to any "cannot reach 7799" refusal. */
export function installHint(state: InstallState = installState()): string {
  switch (state) {
    case 'present':
      return `${WHY} Its data directory ${mnemosyneHome()} is already there, so the app has run on this machine before: start it and call again.`;
    case 'no-trace':
      return `${WHY} Nothing was found at ${mnemosyneHome()}, so it may never have run here. Install it from ${DOWNLOAD_URL}, then call again.`;
    case 'unknown':
      return `${WHY} Whether it is installed here could not be checked. If it is, start it; if it is not, it is at ${DOWNLOAD_URL}.`;
  }
}

/**
 * The sentence to append when the app answers but has no vault yet: its
 * first-run setup is not finished (doc 155 lot 3). Empty for any other error,
 * so a refusal that is not about setup never grows a misleading tail.
 *
 * The person's coding agent can finish the setup itself through the app's
 * own actions server, when the app wrote it into the agent's config.
 */
export function setupHint(message: string): string {
  if (!/\b(VAULT_NOT_READY|NO_VAULT_ROOT)\b/.test(message)) return '';
  return ' Mnemosyne OS is installed but its first-run setup is not finished.'
    + ' If the os_find and os_run tools are available, call setup.state, then setup.propose.'
    + ' Otherwise ask the person to finish the setup in the app; its first screen offers "Set up with my coding agent".';
}
