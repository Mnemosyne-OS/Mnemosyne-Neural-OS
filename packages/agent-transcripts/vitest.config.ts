/**
 * No `vitest/config` import on purpose.
 *
 * `defineConfig` is an identity function, and importing it makes this file
 * unloadable from any runner that is not this package's own installed vitest —
 * which is exactly the state a fresh clone is in before `pnpm install`. A
 * plain object loads everywhere.
 *
 * Node environment: nothing here touches a DOM. The cartridge runs the same
 * code in jsdom, and a rule that only holds in one of the two is a rule that
 * breaks in the other.
 */
export default {
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
};
