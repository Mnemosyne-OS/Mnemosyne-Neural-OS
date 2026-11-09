---
name: mnemosyne-review
description: Show the human a video or image you made and get their answer to THAT file, from their desktop (the Review window of Mnemosyne OS) or from their phone (Telegram buttons, text or voice note). Use whenever you render something a person must approve before you go on (a film, an avatar video, a cut, a thumbnail), and whenever the person says "send it to my phone", "I'll tell you what to change", "wait for my OK". Teaches the open → wait → retake loop and the rule that approval is never publishing.
license: MIT
metadata:
  author: Mnemosyne OS
  homepage: https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS
---

# Mnemosyne Review

You made a video. The human decides if it is good. This skill asks them and waits for
their answer to **that** video, wherever they are.

- At the desk, the video opens in the **Review** window of Mnemosyne OS, next to the
  previous version.
- Away from the desk, once they paired the review bot, it reaches their phone on Telegram
  with **Approve / Change / Reject**. They can also reply with text or a voice note; the
  voice is written out on their machine.

The answer comes back to you as one line you can act on.

## The loop

```text
1. Put the file where the door reads: ~/.mnemosyne/outbox/ (or generations/, voiceovers/)
2. mnemosyne_review_open { path, title: "<name> v1", question?: "what to look at" }
      → id, createdAt
3. mnemosyne_review_wait { id, after: createdAt }
      → every answer since `after`: APPROVED | CHANGES REQUESTED "<text>" at 8s | REJECTED | COMMENT
      → or STILL WAITING (one call waits ~45 s): call it again, SAME id, SAME after
4. CHANGES: apply them, render again, copy the new file to the outbox, then
   mnemosyne_review_open { path, title: "<name> v2", parentId: id }   and wait again.
   A COMMENT carrying frame notes is a packet of corrections: act on all of them, open the
   retake, and keep listening with the `after` the result gave you.
5. APPROVED: stop and tell the human it is approved.
```

## Rules

1. **Approval is not publishing.** Never upload, post or schedule an approved video
   yourself. Hosting and Buffer are buttons the human presses in the Review window.
2. **The file must be in the send folders.** Anything outside `~/.mnemosyne/generations`,
   `~/.mnemosyne/voiceovers` or `~/.mnemosyne/outbox` is refused (`OUTSIDE_SEND_FOLDERS`).
   Copy your render into the outbox; never ask to widen the folders.
3. **Pass `after`.** Use the review's `createdAt`, then the `after` the last result told you.
   Answers given while you were busy are then returned at once, all of them, not lost.
4. **STILL WAITING decides nothing, and it is not the end.** One call waits about 45 s, so it
   never outlives your client's own tool timeout (Claude Code cuts a call at 60 s, as do many
   clients at 60 s). Call again with the same `after`, in a loop, for as long as you listen.
   Never read silence as a yes. The human sees in the Review window whether an agent is
   listening right now.
5. **Waiting without a loop.** If your harness wakes you when a background command ends
   (Claude Code: `run_in_background`), run `mnemosyne-review-wait <id> --after <after>`
   (shipped with `@mnemosyne_os/mcp`; the STILL WAITING result prints the exact command)
   in the background and end your turn. It exits with the answer, or with exit 2 after
   `--for` seconds (default 1800). In a harness without that, run it in the foreground or
   keep the loop.
6. **A voice note without a transcript** (`NOT transcribed: no listening model`) is still an
   answer. Ask the human to type it. Never guess what they said.
7. **Give the frame rate.** Pass `fps` to `mnemosyne_review_open` (the rate you rendered at).
   The human steps the video one frame at a time and pins notes on exact frames; they come
   back as `frame 243 (8.100s): "..."`. Notes come as ONE packet, a COMMENT, once the human
   stops pinning for 30 s (or presses "wake now"): act on all of them in one retake.
   Frame n starts at n / fps seconds.
8. **One review per version.** A retake is a new review with `parentId`, so the human sees
   v1 and v2 side by side. Do not reuse an old review id for a new file.
9. **Use the moment.** "at 8s" in an answer points at second 8 of THAT version.
10. **Name the film.** When the human keeps a board of the film in the Films window, pass its
    id as `project` to `mnemosyne_review_open`: the review then shows on that film's board. A
    retake with `parentId` keeps its parent's film.

## Setup (if the review tools are missing)

The tools (`mnemosyne_review_open`, `mnemosyne_review_wait`, `mnemosyne_review_get`) come from
the `@mnemosyne_os/mcp` server and need the Mnemosyne OS app running. The phone side needs
the human to create a bot with @BotFather and paste its token in **Review › Setup**, then
send the 6-digit code shown there to the bot. You never see or handle that token.
