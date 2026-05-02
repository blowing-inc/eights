# Eights — Design Principles

These principles apply to every feature decision. When in doubt, refer back here.

**Canonical terminology:** `docs/glossary.md` is the single source of truth for all game layer names, entity names, UI destination names, and lifecycle states. When this file conflicts with the glossary, the glossary wins.

**Planned features and open tickets:** `docs/backlog.md` — read this before picking up any issue not already in the GitHub tracker. Contains open bugs, settings/admin items, the draw+merge design spec, and the full release roadmap (1.1.x–1.6.x).

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

## The Cast is a Story, Not a Leaderboard

The Cast is the public face of the game's accumulated culture. A stranger who never played should be able to land on a combatant, read its story, and understand why it's funny.

- Every evolution node must show the moment that caused it — not just "they became this" but **"they beat [opponent] and became this."** The cause is the joke. Without it the result is just a name change.
- The story has to be readable without context. No prior knowledge of the players, the game, or the series should be required to appreciate it.
- Popularity (reactions, win record, appearances) tells you *what* people love. Lineage tells you *why*. Both must be present.
- Display order: story first, stats second. The narrative is the reason anyone cares about the numbers.
- When building any Cast or combatant display feature, ask: *could someone who found this by accident piece together what happened and laugh?* If not, something is missing.

**What this means for implementation:**
- `round.evolution` must always store `opponentName` (or be joinable to `round.combatants` to retrieve it) — the opponent is half the story.
- `buildChainEvolutionStory` is the canonical function for producing this narrative. Use it. Don't re-derive the story inline in a component.
- A combatant detail page with no lineage context is incomplete for variants. Always show where they came from.

---

## Dev Practices

The codebase should be readable by someone who didn't write it — including future contributors with no prior context.

- **Pure functions for game logic.** `gameLogic.js` and `adminLogic.js` have no Supabase imports, no side effects, no React. All meaningful logic lives there and is unit-testable in isolation.
- **Thin screens.** React components handle display and user interaction. They call pure functions and Supabase helpers — they don't contain business logic inline.
- **Test what matters.** Every pure function should have tests. UI components don't need tests. If logic drifts into a component, move it to `gameLogic.js` first, then test it.
  - *Exception — settings-gate smoke tests:* A small number of screen-level tests are intentional. These don't test rendering behavior; they verify that a room setting (e.g. `allowEvolutions`, `allowDraws`) wires through to the expected conditional UI. The gate logic lives in the component and can't be tested in isolation without mocking away the point. Keep these tests scoped to one `describe` per screen, clearly labeled, and limited to `renderToStaticMarkup` + `toContain` assertions — no interaction, no state transitions.
- **One source of truth per concept.** `normalizeRoomSettings` is the canonical place for setting defaults. `applyWinner` is the canonical place for resolving a round. Don't re-implement these inline.
- **Name things for what they do.** A future reader should be able to understand a function from its name and signature without reading its body first.
- **Comments for why, not what.** The code says what it does. Comments explain decisions that aren't obvious from the code alone.
- **App.jsx is a router and session manager, not a business logic file.** It may hold top-level state (currentUser, room, screen) and navigation handlers, but any non-trivial decision logic — series detection, heritage chain translation, draft preparation — belongs in `gameLogic.js` or a dedicated helper, then called from App.jsx. If a function in App.jsx is longer than ~10 lines of logic, ask whether it belongs elsewhere.
- **Prefer deriving data over storing it — except at event boundaries.** For live or computed state, derive rather than store: check whether the value can be reliably computed from data that already exists before adding a new field. Denormalization is acceptable when reads are frequent and the derivation is expensive — not as a default. When a new field is proposed, name the derivation it replaces and explain why caching is worth the drift risk. **The exception is historical event records.** When something happens — a round resolves, a combatant evolves, an arena is selected, a vote is cast — snapshot the context at that moment rather than relying on a future join. `bornFrom.opponentName`, arena data denormalized into the round, player names in room blobs: these are not drift risks, they are the record. Years from now, the referenced entity may have changed or been deleted. The event must still be readable. Rule of thumb: *derive live state; snapshot historical events.*

---

## Draft Roster is Immutable

Once a draft is locked in, the roster for that tournament is fixed for every round.

- An evolution is a **record and a heritage signal** — it documents what happened and carries the variant forward into the next battle's draft. It is not a mid-game roster change.
- The evolved variant does **not** enter play until the next heritage "next battle" draft, where it becomes a prerequisite combatant for the owner.
- In a standalone game with no next battle, the evolution is still recorded — it becomes part of the round's story and the combatant's permanent history.
- No round outcome may alter the combatants fighting in any other round of the same tournament.

| Situation | Principle in action |
|---|---|
| Host confirms evolution mid-game | Record it on the round; do not replace original in future round slots |
| Heritage next battle draft | Variant appears as prevWinner prerequisite via `applyActiveFormMap` |
| Standalone game with evolution | Evolution narrative appears in history; variant exists in The Cast but never fought in that game |

---

## UX Fluidity

Every screen and flow must have a clear way out. Players and hosts should never feel trapped, confused about their state, or unable to recover from a wrong tap.

- **Every screen has a back path.** If a user can navigate to it, they can navigate away. No dead ends.
- **Multi-step flows are always escapable.** Any flow with more than one step must have a visible cancel or back option at every step. Cancelling should restore the prior state cleanly, not leave orphaned data or ambiguous room state.
- **Delegated actions can be reclaimed or declined.** If the host passes an action to a player (e.g. evolution authorship), the host must always have a way to skip or reclaim it. Equally, the player must always have a way to decline and hand it back — being pulled into a screen by the host should never trap the player there. Either side bailing must leave room state clean.
- **Destructive or irreversible steps are clearly labeled.** Non-destructive steps should never look like they aren't. Tapping "submit" on a draft pick feels different from tapping "end game" — the UI should reflect that difference.
- **Flows don't strand state.** If a multi-step flow is cancelled mid-way, the room state must be the same as before it started. No half-written records, no dangling pending flags.
- **When in doubt, add the escape hatch.** The cost of an unused cancel button is zero. The cost of a player stuck in a broken state mid-game is real.

| Situation | Principle in action |
|---|---|
| Evolution passed to owner | Host always has a visible "skip / take back" option; owner always has a visible "decline / pass back" option |
| Draft screen | "Clear pick" available any time before lock |
| Multi-step draw / merge flow | Back button at every step; cancel resets draw state entirely |
| Any modal or sub-flow | Dismiss/cancel is always reachable without completing the flow |

---

## What this app is

A lightweight, offline-assisted tournament tool for friends. Not a platform. Not a product. A shared artifact — the kind of thing you open years later and it still makes sense.

Keep it small. Keep it whole.

---

## Development Workflow

These conventions apply when working issues from the GitHub tracker.

### Shell environment

**Always use Git Bash syntax for all shell commands.** Do not use PowerShell syntax, cmdlets, or PowerShell-style path separators. This applies to every command in every context — terminal invocations, scripts, and inline examples in responses.

- Use forward slashes in paths: `docs/glossary.md` not `docs\glossary.md`
- Use `&&` to chain commands, not `;` or PowerShell pipeline syntax
- Use Unix-style environment variable syntax: `$VAR` not `$env:VAR`
- If a command fails with a shell error, check for PowerShell syntax before anything else and rewrite it in Bash

### GitHub vs. backlog.md

GitHub issues are the source of truth for task status and priority. `docs/backlog.md` holds design context for complex features — read the relevant section when picking up an issue, not as a task list.

- If a section in `backlog.md` has a GitHub issue tracking it, the issue owns the status.
- When a GitHub issue is closed, remove or trim the corresponding backlog section. The backlog should only retain content that wouldn't fit in the issue body: implementation specs, architectural decisions, tradeoffs.

### Starting a new session

Before picking up any issue — or at the start of any session where you might write code — check the repo's current state:

```bash
git status          # confirm working tree is clean
git branch          # confirm you're on main (or know which branch you're on)
gh pr list --repo blowing-inc/eights --state open  # check for open PRs
```

If there's an open PR for a feature branch, check whether it has unresolved Codex review comments before starting new work:

```bash
gh pr view --repo blowing-inc/eights  # review status and any open comments
```

If unresolved Codex comments exist, address those before picking up a new issue. Don't start new work until the user confirms whether to merge, continue, or abandon an open PR.

### Picking up an issue

1. Check the lowest-numbered open milestone first: `gh api repos/blowing-inc/eights/milestones`
2. Within that milestone, take the first open unassigned issue: `gh issue list --milestone '<title>' --state open --repo blowing-inc/eights`
3. Assign it to yourself before starting: `gh issue edit <number> --add-assignee @me --repo blowing-inc/eights`
4. **Create the branch before writing any code** — see Branch naming below.

### Branch naming

```
<issue-number>-<short-title-slug>
```

Examples:
- `12-terminology-retire-battle`
- `23-schema-combatants-status-column`

Always branch from `main` unless the issue body says otherwise.

```bash
git checkout main && git pull
git checkout -b <branch-name>
```

### Doing the work

- Read the full issue body before writing any code.
- Cross-reference any linked design docs in `docs/` before making decisions.
- All game logic goes in `gameLogic.js` as pure functions — no Supabase, no React, fully unit-testable.
- If the issue touches the schema, write the migration SQL in `supabase/` and note any backfill requirements in the PR body.
- Follow existing patterns in the file you're editing before introducing new ones.
- The glossary (`docs/glossary.md`) is the canonical reference for all terminology — check it before naming anything.

### Committing

One logical commit per issue. Message format:

```
<Issue title> (closes #<number>)
```

Example:
```
Terminology refactor: retire 'battle' and 'tournament' (closes #12)
```

### Opening the PR

```bash
gh pr create \
  --repo blowing-inc/eights \
  --title "<issue title>" \
  --body "Closes #<number>

## What changed
<brief summary>

## Test notes
<how to verify — what to look for in the UI or in unit tests>" \
  --draft
```

Open as **draft** by default. Remove draft status when ready for review.

### Automated checks

Two checks run automatically on every push to an open PR:

**Lint** — runs `npm run lint` on all changed `.js/.jsx/.ts/.tsx` files. Must pass before marking the PR ready. Run locally before pushing to catch issues early:

```bash
npm run lint
```

**Codex PR review** — posts inline comments on changed files, grouped by severity (high / medium / low). Read every comment before removing draft status. Address what applies; dismiss what doesn't with a brief note in the PR thread explaining why. If the check fails or the `codex-review-skipped` label appears, it's safe to proceed — the review may have been skipped due to a missing API key or transient error.

Both checks trigger on `pull_request` events (opened and synchronize). They do not run on pushes to `main`.

### Definition of done

Before marking a PR ready:
- [ ] Issue acceptance criteria are all met
- [ ] No new `console.error` or `TODO` left in changed files
- [ ] If game logic changed: unit tests added or updated in the relevant `.test.js` file
- [ ] If UI copy changed: verified against `docs/glossary.md`
- [ ] If schema changed: migration SQL is present and backfill approach is documented
- [ ] `npm run lint` passes with no new errors on changed files
- [ ] Codex PR review comments addressed or dismissed with a note in the PR thread
- [ ] Stay on the feature branch after the PR is open — only switch back to `main` when the PR is merged and main is pulled

Once all checklist items above are complete, mark the PR ready for review:

```bash
gh pr ready --repo blowing-inc/eights
```