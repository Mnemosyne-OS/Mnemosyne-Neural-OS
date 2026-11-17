/**
 * The example test. Replace it with your own, but read it first — it encodes
 * three house rules you will otherwise rediscover the hard way.
 *
 * 1. It is deliberately a `.test.tsx`, not a `.test.ts`. The glob in
 *    vite.config.ts covers both. Shipping one rendering test in the template
 *    means that narrowing that glob back to `.test.ts` breaks this suite
 *    LOUDLY, instead of silently collecting nothing and staying green.
 *
 * 2. It asserts HONEST DEGRADATION, the property a cartridge is judged on. A
 *    cartridge is an iframe with a host on the other side of a postMessage
 *    bridge. In a test there is no host, which is the same shape as a denied
 *    permission or a shell that has not answered yet. The panel must name the
 *    problem and offer a way out. A blank rectangle, or a fabricated `0` where
 *    nothing was measured, is the failure this project cares about most.
 *
 * 3. It AWAITS the settled state (`findBy*`) rather than asserting on the
 *    first frame. The bridge answers asynchronously, so a synchronous
 *    assertion passes while React prints "not wrapped in act(...)" warnings
 *    and you are really testing a frame no user ever sees.
 *
 * Run: pnpm test        Type it: pnpm typecheck
 */
import { render, screen } from '@testing-library/react';
import App from './App';
import manifest from '../mnemo-plugin.json';

describe('the panel with no host answering', () => {
  it('names the refusal and offers a retry, instead of going blank', async () => {
    // Spied, not silenced: the app is SUPPOSED to log this (a catch that says
    // nothing is the project's cardinal sin). Spying keeps the suite's output
    // readable AND turns the log into something the test actually pins.
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<App />);

    // Awaiting this is what lets the bridge settle inside act().
    await screen.findByRole('button', { name: /Retry/ });

    // The static header proves the tree mounted at all.
    expect(screen.getByText('Cartridge Starter Template')).toBeInTheDocument();

    // The refusal SAYS what went wrong. The SDK is specific on purpose: a
    // cartridge opened outside the shell is a different problem from a denied
    // permission, and one generic "error" for both sends people to fix the
    // wrong thing.
    expect(document.body.textContent).toContain('No Mnemosyne host');

    // And an unanswered bridge still reads as a real state, never as a blank
    // or a zero nobody measured.
    expect(screen.getByText('sandboxed')).toBeInTheDocument();

    // The failure reached the console too. Never let a catch swallow one.
    expect(warned).toHaveBeenCalled();
    warned.mockRestore();
  });
});

describe('the panel inside the host', () => {
  it('serves the agent actions its manifest declares, and stops on unmount', () => {
    // A frame stands in for the host: the SDK posts to window.parent.
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const hostWin = frame.contentWindow as Window;
    const posted: Array<{ type: string; actions?: string[] }> = [];
    vi.spyOn(hostWin, 'postMessage').mockImplementation((m: unknown) => { posted.push(m as never); });
    const parent = Object.getOwnPropertyDescriptor(window, 'parent');
    Object.defineProperty(window, 'parent', { configurable: true, get: () => hostWin });
    try {
      const { unmount } = render(<App />);
      // Without this subscription an agent can open the app and do nothing in it.
      const subscribed = posted.find((m) => m.type === 'MNEMO_AGENT_SUBSCRIBE');
      expect([...(subscribed?.actions ?? [])].sort()).toEqual(manifest.agentActions.map((a) => a.id).sort());
      unmount();
      expect(posted.some((m) => m.type === 'MNEMO_AGENT_UNSUBSCRIBE')).toBe(true);
    } finally {
      if (parent) Object.defineProperty(window, 'parent', parent);
      vi.restoreAllMocks();
      frame.remove();
    }
  });
});
