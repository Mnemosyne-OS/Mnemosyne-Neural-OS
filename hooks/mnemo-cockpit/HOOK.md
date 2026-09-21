---
name: mnemo-cockpit
description: "Publish this OpenClaw session's state to the Mnemosyne cockpit"
metadata:
  { "openclaw": { "events": ["message:received", "message:sent", "gateway:startup", "gateway:shutdown", "command:stop"] } }
---

# Mnemosyne cockpit

Turns real OpenClaw Gateway events into a DECLARED agent state, the shape doc 110
asks for: `message:received` means the session started working, `message:sent`
means it is waiting on the human again.

It reads no message content. Only the event family, its action, the session key
and the clock leave this handler.

## Install (the human does this, on the OpenClaw host)

This directory is the copy to take. Put it at `<openclaw-state>/hooks/mnemo-cockpit/`,
then:

```bash
openclaw hooks info mnemo-cockpit     # must print "Ready" with the 5 events
openclaw hooks enable mnemo-cockpit
```

Hook files are NOT watched — restart the Gateway after editing them.

⛔ This hook is deliberately not installed by us and never will be. It runs
inside someone else's agent, on their machine; putting it there is their gesture,
not ours.
