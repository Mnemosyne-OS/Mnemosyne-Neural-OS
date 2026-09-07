import { describe, it, expect } from 'vitest';
import { shellWriteTargets, looksLikePath } from './shellWrites';

describe('shellWriteTargets', () => {
  it('finds a heredoc redirection', () => {
    expect(shellWriteTargets("cat > src/lib/thing.ts <<'EOF'\nconst a = 1\nEOF")).toEqual(['src/lib/thing.ts']);
  });

  it('finds an append', () => {
    expect(shellWriteTargets('echo hi >> notes/log.txt')).toEqual(['notes/log.txt']);
  });

  it('finds a quoted path with spaces', () => {
    expect(shellWriteTargets('node x.mjs > "C:/Users/me/My Docs/out.json"'))
      .toEqual(['C:/Users/me/My Docs/out.json']);
  });

  it('finds tee and its append form', () => {
    expect(shellWriteTargets('pnpm build | tee build.log')).toEqual(['build.log']);
    expect(shellWriteTargets('pnpm build | tee -a build.log')).toEqual(['build.log']);
  });

  it('finds the PowerShell writers', () => {
    expect(shellWriteTargets("Set-Content -Path 'out.txt' -Value x")).toEqual(['out.txt']);
    expect(shellWriteTargets('$x | Out-File -FilePath report.md')).toEqual(['report.md']);
  });

  it('finds an in-place sed', () => {
    expect(shellWriteTargets("sed -i 's/a/b/' src/App.tsx")).toEqual(['src/App.tsx']);
  });

  it('reports several targets from one command, in order', () => {
    expect(shellWriteTargets('grep a f > one.txt; grep b f > two.txt'))
      .toEqual(['one.txt', 'two.txt']);
  });

  it('deduplicates a path written twice', () => {
    expect(shellWriteTargets('echo a > x.txt; echo b >> x.txt')).toEqual(['x.txt']);
  });

  // The whole value of the list is that a row on it is real. Each of these
  // produced a fabricated file name before the guard existed.
  it('never invents a file from a discard, a comparison or an arrow', () => {
    expect(shellWriteTargets('grep x file 2>/dev/null')).toEqual([]);
    expect(shellWriteTargets('node -e "a.filter(x => x.id)"')).toEqual([]);
    expect(shellWriteTargets('if [ $a -gt 3 ]; then echo x; fi')).toEqual([]);
    expect(shellWriteTargets('cmd > $OUT')).toEqual([]);
    expect(shellWriteTargets('cmd > out.*')).toEqual([]);
    expect(shellWriteTargets('cmd >&2')).toEqual([]);
  });

  it('keeps an absolute path even with no extension', () => {
    expect(shellWriteTargets('cat x > /home/me/LICENSE')).toEqual(['/home/me/LICENSE']);
  });

  it('drops a relative word with no extension', () => {
    expect(shellWriteTargets('cat x > somewhere')).toEqual([]);
  });

  // Antigravity stores CommandLine already wrapped in a quote pair. The
  // opening quote used to swallow the first redirection of every command.
  it('unwraps a command stored inside its own quotes', () => {
    expect(shellWriteTargets('"echo hi > out.txt"')).toEqual(['out.txt']);
    expect(shellWriteTargets("'echo hi > out.txt'")).toEqual(['out.txt']);
  });

  it('unwraps once, never repeatedly', () => {
    expect(shellWriteTargets('""echo hi > out.txt""')).toEqual(['out.txt']);
  });

  it('returns nothing for a command that writes nothing', () => {
    expect(shellWriteTargets('npx vitest run')).toEqual([]);
    expect(shellWriteTargets('')).toEqual([]);
  });

  // A module-level /g regex keeps lastIndex between calls. Left unreset, the
  // second command is searched from where the first one stopped.
  it('does not leak match position between two calls', () => {
    const long = `echo ${'x'.repeat(300)} > first.txt`;
    shellWriteTargets(long);
    expect(shellWriteTargets('echo a > second.txt')).toEqual(['second.txt']);
  });

  it('reads a very long command without hanging', () => {
    const huge = 'echo ' + 'a '.repeat(50_000) + '> late.txt';
    const started = performance.now();
    const found = shellWriteTargets(huge);
    expect(performance.now() - started).toBeLessThan(500);
    // Past the cap, so it is NOT found — and that is the honest outcome: the
    // list is a floor, never a census.
    expect(found).toEqual([]);
  });
});

describe('looksLikePath', () => {
  it('accepts what a person would recognise as a file', () => {
    for (const s of ['a.ts', 'src/a.tsx', 'C:/x/y.md', '/tmp/x.py', '~/notes.txt', '/etc/hosts']) {
      expect(looksLikePath(s), s).toBe(true);
    }
  });
  it('refuses what is not one', () => {
    for (const s of ['', '   ', '/dev/null', 'NUL', '$var', 'a*.txt', '-v', '&2', 'x'.repeat(401)]) {
      expect(looksLikePath(s), s).toBe(false);
    }
  });
});
