/**
 * `?raw` imports, which is how a fixture is loaded as text.
 *
 * Vite and Vitest resolve the suffix at build time; TypeScript needs to be
 * told the shape. Declared here rather than by pulling in `vite/client`,
 * because this package has no Vite dependency and must not grow one: the MCP
 * server bundles it with tsup, and a DOM-flavoured ambient type in a Node
 * package is a lie waiting to be believed.
 */
declare module '*?raw' {
  const content: string;
  export default content;
}
