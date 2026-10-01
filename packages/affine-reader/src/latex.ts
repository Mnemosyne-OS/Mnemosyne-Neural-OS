/**
 * Formulas, which the vendored parser drops.
 *
 * AFFiNE stores an inline formula as ONE space carrying a `latex` attribute
 * (`{ insert: ' ', attributes: { latex: 'x^2' } }`), and a formula block as
 * `affine:latex` with the source in `prop:latex`. Upstream's delta-to-md knows
 * neither, so "the solutions are x = ±√2" came out as "the solutions are  ."
 * with nothing saying a formula was there. Measured on AFFiNE's own
 * "Getting Started" document, 2026-09-30.
 *
 * Written as `$…$` / `$$…$$`, the form every Markdown editor with maths reads.
 * The source is kept verbatim: a formula re-typed by a converter is a formula
 * someone has to check again.
 */

/** One op of a Y.Text delta, as `toDelta()` returns it. */
interface DeltaOp {
  insert?: unknown;
  attributes?: Record<string, unknown>;
}

/**
 * Turns each inline formula into its `$source$` text, keeping the other
 * attributes (a formula inside a bold run stays bold). An empty source is not
 * a formula: the op is left as it was.
 */
export function inlineLatexToText<T extends DeltaOp>(delta: T[]): T[] {
  return delta.map((op) => {
    const latex = op.attributes?.latex;
    if (typeof latex !== 'string' || !latex.trim()) return op;
    const { latex: _dropped, ...rest } = op.attributes as Record<string, unknown>;
    return {
      ...op,
      insert: `$${latex.trim()}$`,
      attributes: Object.keys(rest).length > 0 ? rest : undefined,
    };
  });
}

/** A formula block as Markdown, or '' when it holds no source. */
export function latexBlockToMd(source: unknown): string {
  return typeof source === 'string' && source.trim() ? `$$\n${source.trim()}\n$$\n` : '';
}
