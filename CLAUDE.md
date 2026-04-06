# Eights — Design Principles

These principles apply to every feature decision. When in doubt, refer back here.

---

## Narrative Driven

The app is a record of something that happened between real people. Every feature should contribute to a story that can be read back.

- Round outcomes, combatant histories, reactions, votes, and player moments are the **substance** — not decoration. Surface them.
- UI copy, structure, and flow should feel like chapters of a tournament, not screens of an app.
- When adding a feature, ask: *does this make the story richer, or does it add noise?*
- The ticker messages, bot personality, combatant bios — these are part of the voice. Maintain that voice.

## Data Conservative

The goal is that years from now, you and your friends can look at a completed tournament and reconstruct the full drama of it.

- **Don't throw things away.** Undo is better than delete. Soft-end is better than hard-wipe. History is better than nothing.
- Preserve: reactions, picks, round order, combatant lineage, player names, bios, timestamps.
- When a feature would discard data to simplify implementation, find another way.
- Completed rooms are permanent records. Avoid mutations to ended games except for explicit admin correction.

---

## How these apply in practice

| Situation | Principle in action |
|---|---|
| Adding a new round field | Keep it even after the round ends. Don't prune. |
| Combatant evolution feature | Store lineage (`parentId`, `generation`) — the ancestry is part of the story. |
| "Clear history" or bulk-delete UI | Require explicit admin action with confirmation. Never automatic. |
| Chat / reactions | Reactions on a round are forever attached to that round. Don't expire them. |
| New game phases | Each phase transition should leave a trace (timestamps, reason). |
| Variable roster size | Store the setting on the room so old rooms still display correctly. |

---

## What this app is

A lightweight, offline-assisted tournament tool for friends. Not a platform. Not a product. A shared artifact — the kind of thing you open years later and it still makes sense.

Keep it small. Keep it whole.
