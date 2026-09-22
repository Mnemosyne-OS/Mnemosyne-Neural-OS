# The recipes live with the MCP package

They are at **[`packages/mcp/RECIPES.md`](packages/mcp/RECIPES.md)**: one
copy-paste block that gives your coding agent a persistent memory. Claude Code,
Cursor, Claude Desktop and the TypeScript SDK.

## Why this file is here

The package README linked to `./RECIPES.md` for a while. Anything rendering that
README outside its own folder resolves a relative link against the repository
ROOT, which is here. A listing directory does it, and so does the npm page.

Those links are absolute now. The ones already published elsewhere still arrive
at this path, and a listing can take weeks to re-read a repository.

It holds no recipes of its own, on purpose. Two copies of one document drift,
and the copy nobody opens is the one that goes stale.
