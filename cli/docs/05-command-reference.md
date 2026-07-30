# Command Reference

Complete reference for all `mnemoforge` commands.

---

## Top-Level

```bash
mnemoforge                  # Welcome screen
mnemoforge --version        # Display version
mnemoforge --help           # Show all commands
```

---

## mnemoforge init

Scaffold a new Mnemosyne-grade module. Also bootstraps the Resonance Bridge data directory.

```bash
mnemoforge init [module-name]
```

After init, `apps/mnemosync/data/` is ready with your agent's pulse file and an empty `messages/` inbox.

---

## mnemoforge resonance

Multi-agent coordination via the Resonance Bridge protocol.

```bash
# See all agents and their state
mnemoforge resonance agents

# Read your inbox
mnemoforge resonance inbox --agent <id> [--unread-only] [--mark-read]

# Send a message to another agent
mnemoforge resonance send --from <id> --to <id> --message "<text>" [--type <type>] [--priority <level>] [--zone <path>]

# Read/update a pulse
mnemoforge resonance pulse [--agent <id>]
mnemoforge resonance pulse --set-agent <id> --status <status> --zone <path> --intent "<text>"
```

> Full documentation: [Resonance Bridge](09-resonance-bridge.md)

---

## mnemoforge workspace

Manage the project's external safety memory.

### workspace show

Display all workspace rules — run this at the start of every agent session.

```bash
mnemoforge workspace show
```

Reads from `.cli_resonance/WORKSPACE.json` in the current directory (or vault root as fallback).

### workspace add-rule

Append a rule to the workspace after a mistake or decision.

```bash
mnemoforge workspace add-rule "<rule text>" [--section <section>]
```

| Option | Default | Values |
|---|---|---|
| `--section` | `dev` | `npm`, `architecture`, `dev` |

Example:
```bash
mnemoforge workspace add-rule "Never publish outside @mnemosyne_os scope" --section npm
```

---

## mnemoforge chronicle

Manage the AI memory archive.

### chronicle init

Initialize the vault — configure IDE, provider, and vault path.

```bash
mnemoforge chronicle init
```

Run once per machine. Creates `~/.mnemoforge/vault.json`.

### chronicle archive *(primary workflow)*

Archive an agent-written chronicle into the vault.

```bash
mnemoforge chronicle archive --file "<path to .md file>"
```

The file is copied to `.cli_resonance/<IDE>/<Provider>/` in your vault.

```bash
# Example
mnemoforge chronicle archive --file "handbook/chronicles/CHRONICLE-2026-04-05-my-decision.md"
```

### chronicle commit

Create a new chronicle interactively or automatically.

```bash
mnemoforge chronicle commit [options]
```

| Option | Description |
|---|---|
| `--auto` | Generate draft from session context, open in VS Code |
| `--title <title>` | Chronicle title |
| `--type <type>` | Style: `session`, `decision`, `reflection`, `sweep`, `narcissus` |
| `--tags <tags>` | Comma-separated tags |

### chronicle list

List all chronicles in the vault for the current IDE/Provider.

```bash
mnemoforge chronicle list
```

### chronicle sweep

Generate a daily sweep chronicle consolidating recent entries.

```bash
mnemoforge chronicle sweep
```

### chronicle switch

Switch the active IDE or Provider profile.

```bash
mnemoforge chronicle switch
```

---

## Vault Structure Reference

```
~/Documents/MnemoVault/          ← default vault root
  .cli_resonance/
    <IDE>/
      <Provider>/
        CHRONICLE-YYYY-MM-DD-slug.md
        CHRONICLE-YYYY-MM-DD-slug.md
    WORKSPACE.json               ← global workspace (optional)

your-project/
  .cli_resonance/
    WORKSPACE.json               ← project-level workspace rules
    vault.json                   ← vault config for this project
```

---

## Environment

| Requirement | Version |
|---|---|
| Node.js | >= 18.0.0 |
| npm | >= 9.0.0 |

---

## Support

- Repository: [github.com/Mnemosyne-OS/Mnemosyne-Neural-OS](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS)
- Issues: [github.com/Mnemosyne-OS/Mnemosyne-Neural-OS/issues](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS/issues)
- Package: [@mnemosyne_os/forge on npm](https://www.npmjs.com/package/@mnemosyne_os/forge)
