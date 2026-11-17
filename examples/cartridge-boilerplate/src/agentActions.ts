/**
 * agentActions.ts — the agent door (Mnemosyne OS doc 149).
 *
 * The person drives Mnemosyne OS with agents: the agent in their IDE (Claude
 * Code, Cursor, Antigravity), the voice assistant, Hermes. They all reach this
 * cartridge the same way: `os_find` lists the actions the manifest declares,
 * `os_run cartridge.run` calls one in the open window, and the person sees it
 * happen. A cartridge that declares nothing can only be opened by an agent.
 *
 * Two places must agree, and agentActions.test.ts checks that they do:
 *  1. `agentActions` in mnemo-plugin.json declares each action (id, summary,
 *     effect, params). The host shows it to agents and checks the arguments
 *     against it BEFORE a handler runs.
 *  2. `boilerplateAgentHandlers` below serves them. App.tsx subscribes once,
 *     with `sdk.onAgentActions`, while the window is open.
 *
 * Each handler calls the function of the person's own button (`save` is the
 * « Remember » button). Never a second code path for agents: the agent would
 * then get a result the person can never get, or the reverse.
 *
 * Throw an Error to refuse: the agent reads its message and corrects itself.
 * Return a value on success. A `say` field is read aloud by the voice
 * assistant, word for word.
 */
import type { MnemoAgentHandlers } from './sdk/mnemo-sdk';

/** What the handlers need from the app: the same functions its UI uses. */
export interface NoteDoor {
  /** The notes of the sandbox vault. Throws while the vault is not ready. */
  list: () => Promise<string[]>;
  /** The « Remember » button's function. Throws while the vault is not ready. */
  save: (text: string) => Promise<void>;
}

export function boilerplateAgentHandlers(door: NoteDoor): MnemoAgentHandlers {
  return {
    // agent-actions:begin (one line per action declared in mnemo-plugin.json)
    notes: async () => ({ notes: await door.list() }),
    addNote: async ({ text }) => {
      // The host already checked the type and the length; an all-blank text
      // passes that check and would save an empty note.
      const note = typeof text === 'string' ? text.trim() : '';
      if (!note) throw new Error('addNote needs a "text" that is not blank');
      await door.save(note);
      return { saved: true };
    },
    // agent-actions:end
  };
}
