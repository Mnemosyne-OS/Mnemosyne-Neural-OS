// ─────────────────────────────────────────────────────────────────────────────
// lazy.ts — Lazy-loaded heavy dependencies
// Import this INSIDE action handlers only, never at the module top-level.
// This keeps CLI startup under 200ms.
// ─────────────────────────────────────────────────────────────────────────────

/** Returns inquirer — loaded on first use only */
export async function getInquirer(): Promise<typeof import('inquirer')> {
  return import('inquirer');
}
