---
description: Push handbook files to the public GitBook repo safely
---

## Context

There are two repos:
- **Private monorepo**: `github.com/yaka0007/mnemosyne` — the full codebase
- **Public repo**: `github.com/Mnemosyne-OS/Mnemosyne-Neural-OS` — connected to GitBook

The handbook files live in:
`packages/mnemoforge-cli/Mnemosyne-Neural-OS-public/handbook/`

**NEVER use `git checkout` to switch branches on the monorepo while Mnemosyne is running.**
This will cause the Electron app to crash as its working files disappear.

---

## Workflow: Push Handbook to Public Repo

// turbo-all

### 1. Clone the public repo to a safe temp location

```powershell
$temp = "c:\Users\crypt\AppData\Local\Temp\mno-public-push"
if (Test-Path $temp) { Remove-Item $temp -Recurse -Force }
git clone https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS.git $temp
```

### 2. Copy the new/updated handbook files to the temp clone

```powershell
$source = "c:\Users\crypt\Documents\TRAVAIL\xspace\XPACEGEMS ECOSYSTEMS\_MNEMOSYNE_SYSTEM\packages\mnemoforge-cli\Mnemosyne-Neural-OS-public"

# Copy entire handbook folder (safe - overwrites with latest)
Copy-Item "$source\handbook\*" "$temp\handbook\" -Recurse -Force
```

### 3. Commit and push from the temp clone

```powershell
Set-Location $temp
git add handbook/
git commit -m "feat(handbook): <describe what changed>"
git push origin main
```

### 4. GitBook syncs automatically within ~2 minutes

Verify at: https://app.gitbook.com → Neural Coding by Mnemosyne OS

---

## Notes

- This method is **zero-risk** — it never touches the monorepo working directory
- Mnemosyne OS keeps running without interruption
- The temp folder can be reused for subsequent pushes without re-cloning
- `git lfs` is NOT needed for handbook files (all `.md`, no binaries)
