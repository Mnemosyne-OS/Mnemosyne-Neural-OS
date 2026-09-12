---
name: mnemosyne-voice
description: Turn a written script into an audio file using the local voices of Mnemosyne OS — including the human's own cloned voice. Use whenever the user asks for a voice-over, narration, podcast read, or TikTok/YouTube audio track and has Mnemosyne OS installed. Teaches the workflow (list voices, write for the ear, render as a job, report the path) and the rules that make a cloned voice safe to use.
license: MIT
metadata:
  author: Mnemosyne OS
  homepage: https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS
---

# Mnemosyne Voice

Mnemosyne OS runs local, offline text-to-speech engines. Some of them **clone a voice**
from a short reference clip the human recorded themselves. This skill turns a script into
a **WAV file on disk** and hands you its path — made for voice-overs a human will drop on
a video timeline.

Nothing leaves the machine. No cloud service is involved.

You are borrowing **someone's voice**. That framing decides everything below.

## Setup (if the voice tools are not available)

The tools (`mnemosyne_voices`, `mnemosyne_speak`, `mnemosyne_speak_status`) come from the
`@mnemosyne_os/mcp` server, and they are **off by default**. If they are missing, do not
configure anything yourself — ask the human to add one line to their MCP config:

```json
"env": { "MNEMO_VOICE": "1" }
```

and restart their agent session. The MCP server process is spawned once per session, so a
session that started before the change keeps the old one.

Turning it on makes Mnemosyne ask the human to authorize `voice:speak` — a permission that
is never auto-granted, not even to first-party apps, because its subject is their identity
rather than their data. **That dialog is the point.** If it is declined, say so and stop;
the memory tools keep working.

Three preconditions are not your fault when they fail, and each has a different answer:

| Symptom | What it means | What to do |
|---|---|---|
| Cannot reach Mnemosyne | The app is not running | Ask the human to open Mnemosyne OS — the engines are Python sidecars inside it |
| `ENGINE_NOT_INSTALLED` | No local voice installed | Settings → Voice. It is a multi-GB download — tell them, do not wait on it |
| `LICENSE_REQUIRED` | Local neural TTS is a licensed feature | Nothing to retry. Say it plainly |

## The covenant — non-negotiable rules

1. **A cloned voice is a person, not an asset.** Produce only what the human asked for, in
   this conversation. Never make a voice say something the person did not choose to say —
   no impersonation, no words-in-their-mouth, however harmless the framing.
2. **A clone name that does not exist is REFUSED, never substituted.** On `UNKNOWN_CLONE`,
   ask the human which voice they meant. ⛔ Do **not** retry with a name you invented: a
   voice-over in the wrong voice sounds perfect and is worthless — the human may not
   notice until it is published.
3. **Always report the file path and what was spoken.** Audio the human cannot find is
   audio they cannot check.
4. **You may list and choose voices. You may never create one.** Recording a voice print
   is the human's own act, done in the app.
5. **A render is a job — poll it, never restart it.** The engine synthesizes one thing at
   a time, so re-issuing a render that is still running doubles a wait you are already in.

## The workflow

### 1. Ask what can speak

Call **`mnemosyne_voices`** first, every time. It is the only source of valid clone names,
and it tells you which engines are installed:

- **`xtts`**, **`chatterbox`**, **`zonos`** clone a voice. `chatterbox` is the most
  expressive; `zonos` takes an emotion vector.
- **`piper`** is fast with fixed voices and **cannot clone**. Asking it for a clone is
  refused rather than quietly answered in a stock voice.

Read the `warning` on each reference voice. `REFERENCE_TOO_SHORT` (under ~3 s) means the
resemblance will collapse — say so **before** spending minutes of synthesis on it.

### 2. Write the script for the EAR

This is where most of the quality lives, and it is entirely your job — the engine reads
what you give it, literally.

- **Strip all markdown.** `**bold**`, `#`, `-`, and emoji are pronounced. So are URLs.
- **Expand everything a reader's eye would skip**: `≈` → "environ", `2026` → "deux mille
  vingt-six", `TTS` → "T T S" or "synthèse vocale", `€12.50` → "douze euros cinquante".
- **Punctuate for pacing.** A comma is a breath, a period is a stop. A fragment with no
  grammatical end makes an autoregressive engine ramble — 84 characters once produced
  34 seconds of audio.
- **Read it aloud in your head.** If you stumble, so will the engine.

### 3. Render

Call **`mnemosyne_speak`** with the script, a `clone` name if the human wants a specific
voice, and a `title` that names the file recognizably (`"Short 12 — la mémoire souveraine"`).

Long scripts are split at sentence boundaries and reassembled into **one** file; nothing is
truncated. The cap is 20 000 characters per render — past that, split the script into
scenes and render one file per scene.

Synthesis runs at roughly real time: **a 3-minute script takes about 3-4 minutes**, plus a
one-off ~30 s cold start the first time an engine wakes up. The tool waits, then hands back
a job id if it is still going. Poll with **`mnemosyne_speak_status`** — never start over.

### 4. Report

Give the human the **path**, the length, and which voice was used. If the job reports a
`cloneWarning`, tell them to listen before publishing.

Note when the job comes back with `clone: null`: the engine spoke in its own built-in
voice, not theirs. That is a real difference and they need to hear about it from you rather
than from the audio.

## Format

WAV, mono. There is no ffmpeg in the build, so MP3 is not an option — every video editor
reads WAV, so this costs nothing. If the human needs MP3, tell them to convert it in their
editor.

## Using it from code instead

A script or a cartridge reaches the same surface through `@mnemosyne_os/sdk`:

```ts
const mnemo = await MnemoClient.connect({ appId: 'my-app', manifest });
// manifest.scopes must include 'voice:speak', manifest.intents 'VOICE_SPEAK'

const { clones } = await mnemo.voiceEngines();
const { job } = await mnemo.renderVoice({
  text:  'Bonjour, et bienvenue.',
  clone: clones?.[0]?.name,
  title: 'Intro',
});
// renderVoice polls for you and NEVER throws on time: a job still rendering
// comes back as one, with the id to poll. It does not restart itself.
console.log(job?.state, job?.path);
```
