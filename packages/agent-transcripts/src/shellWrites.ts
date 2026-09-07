/**
 * Files a shell command creates.
 *
 * ## Why this is code and not connector data
 *
 * A connector is DATA a stranger can ship (doc 93 §3), so it may never carry a
 * regular expression: a pathological pattern would hang the reader on someone
 * else's machine. The connector therefore says only WHICH tools are shells and
 * WHERE their command string sits; the patterns live here, bounded, and are
 * tested.
 *
 * ## Why it exists at all
 *
 * Measured over 211 Claude Code transcripts on 2026-08-29: 98 sessions wrote
 * at least one file through a shell and nowhere else, 678 distinct paths in
 * all. One session wrote 29 files and showed zero, because it never once used
 * the Write tool. A dashboard that lists what an agent produced cannot ignore
 * two thirds of the ways an agent produces it.
 *
 * ## Why it is an INFERENCE and must be labelled as one
 *
 * A `tool_use` entry naming Write and a file_path is a RECORD: the harness
 * wrote it down. A redirection read out of a command string is a reading of an
 * intention — the command may have failed, the path may be a variable that
 * expanded to something else. Both belong on screen; presenting them as the
 * same kind of fact would be the doc 93 §2 mistake in another costume, so
 * every path found here carries `origin: 'shell'` and the view says so.
 *
 * These patterns are a FLOOR, never a census. A script that opens a file in
 * python and writes to it leaves nothing here to match.
 */

/** Commands longer than this are read up to the cap and no further. A single
 *  transcript line can carry a whole file inside a heredoc, and there is
 *  nothing to find past the first line of the command anyway. */
const MAX_COMMAND_CHARS = 4000;

/** No nesting, no alternation inside a quantifier: each of these is linear on
 *  the input, so a hostile transcript costs reading time and nothing worse. */
const PATTERNS: RegExp[] = [
  // cat > file, printf >> file, node x.mjs > out.txt — the redirection itself.
  /(?:^|[\s;|&])>>?\s*(?:"([^"\n]{1,400})"|'([^'\n]{1,400})'|([^\s"'<>|;&\n]{1,400}))/g,
  // tee file, tee -a file
  /(?:^|[\s;|&])tee\s+(?:-a\s+)?(?:"([^"\n]{1,400})"|'([^'\n]{1,400})'|([^\s"'<>|;&\n]{1,400}))/g,
  // PowerShell's two writers.
  /(?:^|[\s;|&])Set-Content\s+(?:-Path\s+)?(?:"([^"\n]{1,400})"|'([^'\n]{1,400})'|([^\s"'<>|;&\n]{1,400}))/gi,
  /(?:^|[\s;|&])Out-File\s+(?:-FilePath\s+)?(?:"([^"\n]{1,400})"|'([^'\n]{1,400})'|([^\s"'<>|;&\n]{1,400}))/gi,
  // sed -i edits a file in place. It is a write even though nothing is created.
  /(?:^|[\s;|&])sed\s+-i[^\s]*\s+(?:-e\s+)?(?:"[^"\n]{0,400}"|'[^'\n]{0,400}')\s+(?:"([^"\n]{1,400})"|'([^'\n]{1,400})'|([^\s"'<>|;&\n]{1,400}))/g,
];

/** The sinks that are not files. Writing to one is not producing anything. */
const NOT_A_FILE = new Set(['/dev/null', '/dev/stdout', '/dev/stderr', 'nul', '$null', 'con']);

/**
 * Is this candidate a path we can honestly name?
 *
 * Deliberately strict. A false positive here invents a file that never
 * existed, and an invented row in a list of "what your agent produced" is
 * worse than a missing one — the whole point of the list is that you can trust
 * what is on it.
 */
export function looksLikePath(raw: string): boolean {
  const s = raw.trim();
  if (!s || s.length > 400) return false;
  if (NOT_A_FILE.has(s.toLowerCase())) return false;
  // A shell variable, a substitution or a glob does not resolve to one name.
  if (/[$`*?]/.test(s)) return false;
  if (s.startsWith('&') || s.startsWith('-')) return false;
  const isAbsolute = /^([A-Za-z]:[\\/]|\/|~\/)/.test(s);
  const hasExtension = /\.[A-Za-z0-9]{1,6}$/.test(s);
  // An extensionless relative word is far more often a file descriptor, a
  // number or a stray token than a file. Absolute paths are unambiguous.
  return isAbsolute || hasExtension;
}

/**
 * A command stored wrapped in its own quotes, unwrapped once.
 *
 * Antigravity writes `args.CommandLine` as `"\"git status\""`, so the whole
 * command arrives inside a literal quote pair. Left alone, the opening quote
 * swallows the first redirection of every command that agent ever ran. One
 * pair only: a command that legitimately starts and ends with a quote is a
 * different shape, and unwrapping repeatedly would eat real arguments.
 */
function unwrapCommand(command: string): string {
  const s = command.trim();
  if (s.length < 2) return command;
  const first = s[0];
  if ((first === '"' || first === "'") && s.endsWith(first)) return s.slice(1, -1);
  return command;
}

/**
 * Every path one shell command appears to write, in the order it names them.
 *
 * Returns the raw strings as written in the command: they can be relative, and
 * resolving them would mean guessing a working directory the transcript does
 * not always carry. A relative path in the list is still recognisable, and an
 * invented absolute one would not be.
 */
export function shellWriteTargets(command: string): string[] {
  if (typeof command !== 'string' || !command) return [];
  const unwrapped = unwrapCommand(command);
  const text = unwrapped.length > MAX_COMMAND_CHARS ? unwrapped.slice(0, MAX_COMMAND_CHARS) : unwrapped;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const pattern of PATTERNS) {
    // Each pattern carries the g flag and is module-level, so lastIndex has to
    // be reset: leaving it where the previous command stopped silently skips
    // the beginning of the next one.
    pattern.lastIndex = 0;
    for (const m of text.matchAll(pattern)) {
      const candidate = (m[1] ?? m[2] ?? m[3] ?? '').trim();
      if (!looksLikePath(candidate)) continue;
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      out.push(candidate);
    }
  }
  return out;
}
