/**
 * No `vitest/config` import on purpose.
 *
 * `defineConfig` is an identity function, and importing it makes this file
 * unloadable from any runner that is not this package's own installed vitest —
 * which is exactly the state a fresh clone is in before `pnpm install`. A
 * plain object loads everywhere.
 *
 * jsdom environment: the whole package is a `window.parent.postMessage`
 * bridge — `window`, `document`, and `MessageEvent` are load-bearing, not
 * incidental, so tests need a real DOM, not a Node stub.
 */
export default {
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
};
