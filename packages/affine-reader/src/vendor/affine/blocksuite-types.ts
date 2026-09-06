/**
 * Local stand-ins for the two types the vendored parser imported from
 * `@blocksuite/affine/model`.
 *
 * Both were `import type` — erased at compilation, never present at runtime —
 * so replacing them changes NO behaviour. They are declared here only so this
 * package does not need `@blocksuite/affine` (MPL-2.0) on its resolution path
 * just to typecheck. See ../../..//NOTICE.md.
 *
 * Shapes derive from how `parser.ts` actually reads them (a database block's
 * `prop:columns` and `prop:cells`), not from BlockSuite's full model.
 */

/** One column of an `affine:database` block. */
export interface ColumnDataType {
  id: string;
  /** 'title' | 'select' | 'multi-select' | … — free-form, the parser switches on it. */
  type: string;
  name: string;
  data: Record<string, unknown>;
}

/** One cell of an `affine:database` block. */
export interface CellDataType {
  columnId?: string;
  value?: unknown;
}
