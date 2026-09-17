# Security policy

This page says how to report a vulnerability in Mnemosyne OS, what happens
after you do, and what protections are in place on this repository. Every
claim below can be checked on the Security tab of this repository without
taking our word for it.

## Reporting a vulnerability

Report privately. A public issue tells everyone how to exploit the problem
before anyone can fix it.

- **Preferred:** [open a private report on GitHub](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS/security/advisories/new).
  It goes only to the maintainers, and the thread stays private until a fix
  is out.
- **Email:** [dev@mnemosyne-os.com](mailto:dev@mnemosyne-os.com).
- **Machine-readable contact:** [mnemosyne-os.io/.well-known/security.txt](https://mnemosyne-os.io/.well-known/security.txt)
  (RFC 9116).

What helps us act fast:

- The part affected: desktop app, an `@mnemosyne_os/*` package, the
  MnemoForge CLI, the MCP server, a website.
- The version you tested. Settings › About in the app, `npm view` for a
  package.
- Steps to reproduce, and what an attacker gains.
- A fix, if you have one.

### What happens next

| Step | When |
|---|---|
| We acknowledge your report | within 48 hours |
| We tell you whether we can reproduce it | within 7 days |
| Fix for a critical issue | target 7 days |
| Fix for a high issue | target 14 days |
| Fix for a medium issue | target 30 days |
| Fix for a low issue | next release |

You are credited in the release notes unless you ask not to be.

## Scope

In scope:

- The Mnemosyne OS desktop app (Windows, macOS, Linux) and its updater.
- The packages published under `@mnemosyne_os` on npm, including the MCP
  server and the SDK.
- The MnemoForge CLI in this repository.
- mnemosyne-os.io, mnemosyne-os.com and docs.mnemosyne-os.io.
- The license and credit gate the app talks to.

Out of scope: a vulnerability in a third-party model provider you reach
through the app (Google, OpenAI, Anthropic and others). Also out of scope: a
finding that needs a machine already compromised by something else.

## Supported versions

The desktop app updates itself. Only the latest release listed on the
[releases page](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS/releases)
receives fixes; a report against an older version is first checked on the
current one. For the npm packages, the latest published version of each is
supported.

## What is in place

All of this is visible on the
[Security tab](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS/security)
of this repository.

- **CodeQL** scans every push to `main`, and weekly. Open alerts are listed
  under Code scanning, with the date of the last scan.
- **Dependabot** watches the dependency manifests and opens a pull request
  when a dependency has a known vulnerability.
- **Secret scanning** runs on every push, and push protection blocks a push
  that contains a recognised secret.
- **Private vulnerability reporting** is enabled, which is what makes the
  first link on this page work for anyone.

Two facts about the product itself, for people evaluating it:

- Vault contents live on your machine, in files and SQLite databases under
  your own user directory. Mnemosyne OS runs no server that holds them.
- Cloud API keys you enter are encrypted at rest with Electron's
  `safeStorage`, in a file only your user can read. That means DPAPI on
  Windows, Keychain on macOS, the desktop keyring on Linux. A Linux desktop
  with no keyring gets a fixed key instead, and the app reports that state.

## What is not in place yet

No third-party penetration test has been done on the app. No dynamic
scanning runs against the websites. When either happens, this page will say
so and link the result.

## Bugs that are not security issues

A crash, a wrong answer, a window that will not open: those are ordinary
bugs, and they go in the open.

- **From inside the app:** every window has a bug button in its title bar.
  It fills in the version, the OS and the machine details, shows you exactly
  what will be sent, and sends nothing until you confirm.
- **On GitHub:** [open a bug report](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS/issues/new/choose).
  The form asks for the part affected, the version and the steps.
- **Not sure it is a bug?** Ask in
  [Discussions](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS/discussions).

If you are not certain whether something is a security issue, report it
privately. Moving a private report to a public issue costs nothing; the
other direction cannot be undone.

---

XPACEGEMS LLC, Miami, FL 33122, USA. This policy covers the Mnemosyne OS
desktop app, the `@mnemosyne_os` packages and the MnemoForge CLI.
Last updated: September 17, 2026.
