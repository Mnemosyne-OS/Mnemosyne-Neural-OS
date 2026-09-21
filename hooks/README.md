# Hooks

A hook makes an agent report itself without the model having to remember to.
Each directory here is a copy you take and install yourself, on your own
machine, in your own agent.

**We never install one for you.** These run inside someone else's agent, so
putting them there is your gesture, not ours.

| Hook | Harness | What it does |
|---|---|---|
| [`mnemo-cockpit`](./mnemo-cockpit/) | OpenClaw Gateway | Turns Gateway lifecycle events into a declared agent state on the Mnemosyne OS cockpit. Reads no message content. |

Its own `HOOK.md` carries the install steps and says what is proven and what is
not.

## Claude Code

Claude Code's hook ships with [`@mnemosyne_os/mcp`](../packages/mcp/), as the
`mnemosyne-cockpit-hook` binary. It lives there because it talks to the app
over the same WebSocket that package already depends on. The settings block is
in
[that README](../packages/mcp/README.md#keep-the-status-card-honest-without-the-model-remembering).

## Cursor, Antigravity

Neither has a hook here. The three agent-awareness tools in
[`@mnemosyne_os/mcp`](../packages/mcp/) read what every harness already writes
to disk and need no hook at all.
