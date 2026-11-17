/**
 * The agent door (agentActions.ts): the manifest and the handlers agree.
 *
 * A declared action without a handler is offered to agents and fails when
 * called. A handler without a declaration is never called: the host relays
 * only what the INSTALLED manifest declares. Both mistakes are silent in the
 * app, so this file catches them. Keep it when you replace the actions.
 *
 * The shape checks copy the host's own rules, so this folder tests on its own,
 * wherever you copy it. The host refuses the WHOLE list when one declaration
 * breaks them, and then no agent can drive the app at all.
 */
import { describe, it, expect, vi } from 'vitest';
import manifest from '../mnemo-plugin.json';
import { boilerplateAgentHandlers } from './agentActions';

interface Declared {
  id: string;
  summary: string;
  effect: string;
  params?: Record<string, { type: string; description: string }>;
  required?: string[];
}

const declared: Declared[] = (manifest as { agentActions?: Declared[] }).agentActions ?? [];
const guide: unknown = (manifest as { agentGuide?: unknown }).agentGuide;

function door() {
  return { list: vi.fn(async () => ['first note', 'second note']), save: vi.fn(async (_text: string) => {}) };
}

describe('the manifest and the handlers', () => {
  it('every declared action has its handler, and no handler is undeclared', () => {
    const served = Object.keys(boilerplateAgentHandlers(door()));
    expect(declared.length).toBeGreaterThan(0);
    expect([...served].sort()).toEqual(declared.map((a) => a.id).sort());
  });

  it("each declaration passes the host's check", () => {
    expect(declared.length).toBeLessThanOrEqual(40);
    expect(new Set(declared.map((a) => a.id)).size).toBe(declared.length);
    for (const a of declared) {
      expect(a.id).toMatch(/^[a-z][a-zA-Z0-9]{0,39}$/);
      expect(['read', 'write', 'spend']).toContain(a.effect);
      expect(a.summary.trim().length).toBeGreaterThan(0);
      expect(a.summary.length).toBeLessThanOrEqual(300);
      const params = a.params ?? {};
      expect(Object.keys(params).length).toBeLessThanOrEqual(16);
      for (const [name, p] of Object.entries(params)) {
        expect(name).toMatch(/^[a-zA-Z][a-zA-Z0-9]{0,39}$/);
        expect(['string', 'number', 'boolean', 'object', 'list']).toContain(p.type);
        expect(p.description.trim().length).toBeGreaterThan(0);
        expect(p.description.length).toBeLessThanOrEqual(300);
      }
      for (const key of a.required ?? []) expect(Object.keys(params)).toContain(key);
    }
  });

  it('the guide fits the 1,500 characters the host keeps (a longer one is dropped)', () => {
    const text = typeof guide === 'string' ? guide : Array.isArray(guide) ? guide.map((l) => `- ${String(l).trim()}`).join('\n') : '';
    expect(text.length).toBeGreaterThan(0);
    expect(text.length).toBeLessThanOrEqual(1500);
  });
});

describe('the handlers call the app', () => {
  it('addNote saves through the Remember button function, trimmed', async () => {
    const d = door();
    const result = await boilerplateAgentHandlers(d).addNote!({ text: '  buy milk  ' });
    expect(d.save).toHaveBeenCalledWith('buy milk');
    expect(result).toEqual({ saved: true });
  });

  it('addNote refuses a blank text, and saves nothing', async () => {
    const d = door();
    await expect(Promise.resolve(boilerplateAgentHandlers(d).addNote!({ text: '   ' }))).rejects.toThrow(/not blank/);
    expect(d.save).not.toHaveBeenCalled();
  });

  it('notes answers what the vault holds', async () => {
    expect(await boilerplateAgentHandlers(door()).notes!({})).toEqual({ notes: ['first note', 'second note'] });
  });

  it('a refusal of the app reaches the agent as an error', async () => {
    const d = door();
    d.save.mockRejectedValueOnce(new Error('The sandbox vault is not ready yet'));
    await expect(Promise.resolve(boilerplateAgentHandlers(d).addNote!({ text: 'x' }))).rejects.toThrow(/not ready/);
  });
});
