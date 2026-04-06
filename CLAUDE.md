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

## Player Continuity First

Re-engagement is the top priority. A player who loses their session should always have a path back to their game.

- Logged-in accounts are the preferred state. Auth solves re-engagement; guests cannot reliably return after a refresh or phone switch.
- Guests are **allowed but not preferred**. Never block a guest from playing, but nudge them toward login at natural moments (joining, draft submit, etc.). Don't lecture — just make the benefit clear.
- The "host can delete a game" function exists as a last resort when a guest-session breakdown makes a room unrecoverable. It's a pressure valve, not a feature to lean on.
- New features that increase data persistence or re-engagement for guests are welcome. New features that make the guest path stickier at the cost of continuity are not.

## Host Has Authority

90% of games are played IRL with the app as a supplement. The host orchestrates the experience; other players create and react.

- The host starts rounds, confirms winners, controls pace. This is intentional — don't dilute it.
- Players vote, react, draft, and express themselves. Their creative input should never be blocked or rushed by the host role.
- The app must also support **fully remote play**. Host/admin controls need to be robust enough that a host can run a clean game over a group chat with no physical presence.
- When adding host controls: make them fast and unambiguous. When adding player-facing features: make them expressive and low-friction.

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
| Guest playing on mobile | Offer login prompt at draft-submit. One tap, not a wall. |
| New host control | Single confirm max. Hosts need speed, not ceremony. |
| New player-facing feature | Should work identically for guests and logged-in users. |

---

## Dev Practices

The codebase should be readable by someone who didn't write it — including future contributors with no prior context.

- **Pure functions for game logic.** `gameLogic.js` and `adminLogic.js` have no Supabase imports, no side effects, no React. All meaningful logic lives there and is unit-testable in isolation.
- **Thin screens.** React components handle display and user interaction. They call pure functions and Supabase helpers — they don't contain business logic inline.
- **Test what matters.** Every pure function should have tests. UI components don't need tests. If logic drifts into a component, move it to `gameLogic.js` first, then test it.
- **One source of truth per concept.** `normalizeRoomSettings` is the canonical place for setting defaults. `applyWinner` is the canonical place for resolving a round. Don't re-implement these inline.
- **Name things for what they do.** A future reader should be able to understand a function from its name and signature without reading its body first.
- **Comments for why, not what.** The code says what it does. Comments explain decisions that aren't obvious from the code alone.

---

## What this app is

A lightweight, offline-assisted tournament tool for friends. Not a platform. Not a product. A shared artifact — the kind of thing you open years later and it still makes sense.

Keep it small. Keep it whole.
