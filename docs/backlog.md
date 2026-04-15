# Eights — Feature Backlog

Planned work, open tickets, and implementation specs. Check this before picking up any issue not already in the GitHub tracker.

Canonical terminology: [docs/glossary.md](glossary.md). The glossary wins over anything written here.

---

## Open Tickets

Small gaps and bugs in the current codebase. Each can be picked up independently.

### [P2] Non-host feedback when a round is undone

When the host undoes a round, the round list just changes for other players with no indication. A brief status line ("Host undid round X") on the non-host battle screen would improve clarity.

### [P2] Guest open-lobby persistence

Guest lobbies are tracked in localStorage by room ID. Clearing storage or switching browsers loses them. Consider a "You may have active games — enter a code to rejoin" prompt on the Join screen for guests, or expose a manual rejoin flow.

### [P2] Series standings missing Draws column

`computeSeriesStandings` tracks wins/losses/games but the standings table displays only W/L/G. Draws are recorded on combatants. If draws are meaningful to the series narrative, add a D column. Low effort, low risk.

### [P3] Evolution name uniqueness check is published-only

`checkCombatantNameExists` only compares against published combatants. A currently-running game could contain an unpublished combatant that shares a name with an evolution target — both would pass validation and get published simultaneously. Low probability but a real integrity gap: two distinct Cast entries with the same name corrupt the lineage record.

### [P3] Spectators can't react or chat

Spectators observe only. Allowing spectators to react (but not vote or chat) could add energy to in-person sessions without giving them meaningful influence over outcomes. Worth discussing as an opt-in room setting.

---

## Settings & Admin

Ready-to-build items. No design blockers remaining. Prioritized within each section.

> Note: Copy rejoin link is implemented. The items below are not yet built.

### User Settings

#### [P1] Change PIN

Currently a user can only get their PIN changed if an admin resets it. Should require: current PIN, new PIN (twice). Validates current PIN against DB before allowing the update. Removes a whole class of admin support requests.

#### [P1] My profile shortcut

Getting to your own profile requires: Home → Players → find yourself. The pill should have a "My profile" menu item that jumps directly there. One-tap navigation, zero new infrastructure — just pass `profileId = playerId` from the pill.

#### [P2] Default room settings

Pre-populate the CreateRoom form with the host's preferred roster size, bio required, blind voting, etc. Store as a JSON blob in the users table (new column: `preferred_settings`). On CreateRoom mount, fetch the user's preferences and pass them as defaults. Worth building if the settings ceremony gets annoying for frequent hosts.

#### [P2] Color theme toggle

Dark / Light / System. The app already uses CSS variables throughout. Implementation: a `data-theme` attribute on `<html>` plus a small `index.css` update to define a light theme override block. Persist to localStorage. No DB needed. Only worth doing if the default dark theme is causing complaints.

#### [P2] Username change

Rare need, but painful when you want it. Requires: uniqueness check against the users table, then cascade the new name into `owner_name` on combatants and player name on room blobs. The room blob cascade is the expensive part (full table scan, same as guest re-attribution). Label clearly as "this updates your name everywhere."

#### Don't build

- Notification preferences: no push notification infrastructure, nothing to configure.
- Per-user combatant display preferences: speculative, no signal that anyone wants this.
- Accessibility settings: real concern but out of scope for now.

### Admin Tools

Current coverage: Games (end/delete rooms), Users (PIN reset, account merge, guest attribution), Combatants (search/edit name+bio/delete), Stats (recalc win-loss from room history), Inspector (view room JSON, full export).

#### [P1] Manual combatant publish

When a game ends early, combatants stay unpublished permanently. They fought — they should be in The Cast. Currently there's no fix without writing SQL directly.

`CombatantsTab` already shows the unpublished badge. Add a "Publish" button next to it that calls `publishCombatants([id])`. One function call, already exists in `supabase.js`.

#### [P1] Bulk dev room deletion

Dev mode rooms accumulate quickly. `GamesTab` "All" view shows them but requires one-by-one deletion. Add a "Delete all dev rooms" action (with confirm) at the top of GamesTab when `devMode` rooms are present. Reads the full room list, filters for `devMode === true`, deletes in a loop. Low blast radius: dev rooms have no published combatants and no real history.

#### [P1] Room JSON editor

The Inspector shows the raw room JSON but can't edit it. When a room gets into a stuck state (stale pending flag, wrong combatant snapshot), there's no recovery path except writing SQL directly.

`InspectorTab`: add an "Edit JSON" toggle that swaps the `<pre>` read-only view for a `<textarea>` pre-filled with the JSON. Validate JSON on submit, show parse errors inline. Require a second confirmation step ("I understand this can corrupt game state"). Use `sset()` to write. Label clearly as a last-resort tool.

#### [P2] Combatant re-attribution (registered → registered)

`GuestSection` handles guest → registered. But what if one registered user entered a combatant for another player? Would need: search for the combatant, pick a new owner from the user list, update `owner_id` + `owner_name` in combatants table. Room history blobs embed `ownerName` on combatant snapshots at fight time — those are display-only and don't need updating.

#### [P2] Combatant full record view

`CombatantsTab` shows name / bio / wins / losses / published status. It does not show lineage, `bio_history`, or the raw record. A "View full record" expand (just a `<pre>` of the raw combatant row) would cover debugging without building a separate tool.

#### [P2] Series repair

If a series gets partially broken — e.g. `nextRoomId` pointing to a cancelled room, or a room missing its `seriesId` — there's no admin tool to fix it. This is a dependency on the Room JSON editor (P1 above): if the JSON editor exists, series repair comes for free by editing the room blobs directly.

#### Don't build

- Audit log: requires a new table and write hooks on every admin action. Overkill at current scale. The room's `endedByAdmin` flag and git history are enough.
- Recalculate series standings: derived data, recomputed on every render. Fix the rooms, not the standings.
- Scheduled cleanup jobs: the app is a permanent record. Don't auto-delete anything.

#### Recommended build order

If picking the next 3 admin/settings items:

1. **Manual combatant publish** — closes a real data hole with one button and an existing supabase function.
2. **Room JSON editor** — the one tool that makes everything else fixable without SQL access.
3. **Change PIN** — removes a whole class of admin support requests.

---

## Draw + Merge Design

Full implementation spec. Not yet started. Builds on current draw logic with backward compatibility preserved throughout.

### Current state

- `round.draw: true` — flat boolean, always applies to all combatants in the round
- `declareDraw()` — host-only, one click, no options
- Stats: every combatant in `round.combatants` gets `draws += 1`
- No partial draws, no draw advancement, no merge concept

### Concept 1 — Partial Draws (some vs. all)

In a 3-way round, the host may want to declare a draw between only two combatants while the third gets a loss.

`round.draw` becomes an object:

```js
// Old (backward compat — treat boolean true as full draw)
round.draw: true

// New
round.draw: {
  combatantIds: string[]  // which combatants are in the draw
}
```

Logic in `applyDraw`:
- Combatants in `draw.combatantIds` → `draws += 1`
- Combatants in `round.combatants` but NOT in `draw.combatantIds` → `losses += 1`
- Backward compat: `round.draw === true` means all combatants draw (existing data safe)

UI: when host clicks "Declare Draw" and there are 3+ combatants, show a multi-select for which are drawing. With only 2, skip straight to the outcome step.

### Concept 2 — Draw Outcomes (advance vs. no advance)

A draw can mean two different things narratively — "nobody won, move on" vs. "they both won, honor both of them."

New field `round.drawOutcome`:

| Outcome | Stat effect | Heritage effect |
|---|---|---|
| `no_advance` (default) | `draws += 1` for each | Neither owner carries heritage forward |
| `all_advance` | `wins += 1` for each drawing combatant | All drawing owners can trigger evolution; all get heritage series credit |

The host chooses this immediately after the partial/full draw selection. Default is `no_advance` to preserve current behavior.

### Concept 3 — Merge Evolution (N-way)

Any combatants that drew under `all_advance` can fuse into a new combined entity with multi-party authorship.

*Example: Egg, Bacon, and Toast all draw → merge into "Country Breakfast" monster. All three owners contributed; one primary owner controls it going forward.*

Only available when: `drawOutcome === 'all_advance'` AND 2+ combatants are in the draw.

New field `round.merge` (analogous to `round.evolution`):

```js
round.merge: {
  fromIds:          string[],   // all parent IDs (N >= 2)
  fromNames:        string[],   // all parent names (snapshot)
  toId:             string,     // new global combatant ID
  toName:           string,
  toBio:            string,
  primaryOwnerId:   string,     // controls merged combatant in series
  primaryOwnerName: string,
  coOwnerIds:       string[],   // credited; no series slot
  coOwnerNames:     string[],
  authorId:         string,     // who named it (primary owner or host)
  mergeNote:        string | null,  // optional caption: table reaction to the merge moment
}
```

Global combatant lineage for a merged combatant:

```js
lineage: {
  rootId:      primaryParent.lineage.rootId || primaryParentId,
  parentId:    primaryParentId,
  coParentIds: string[],          // all other parents in a merge
  generation:  Math.max(...allParentGens) + 1,
  bornFrom: {
    type:         'merge',
    parentNames:  string[],
    parentIds:    string[],
    roundNumber:  number,
    gameCode:     string,
    parentName:   primaryParent.name,
    opponentName: null,           // N/A for merges
  }
}
```

**Primary owner:** host designates which owner controls the merged combatant. All others become co-owners. Suggested default: combatant with the most wins (or first in list if tied). Single host tap — no ceremony.

**Merge bio authorship:** the primary owner (or host, if they decline) writes a fresh bio for the merged combatant. Parent bios are shown as collapsible reference cards above the bio input — one card per parent, collapsed by default. The form is otherwise identical to `EvolutionForm`.

**Heritage series draft:** merged combatant appears as prerequisite for the primary owner only. Co-owners are credited in history but get no draft slot from this merge.

### UI Flow (VoteScreen)

The existing "Declare draw" button becomes a multi-step flow:

```
Step 1 (if 3+ combatants in round):
  "Who is drawing?" — multi-select combatants (all selected by default)

Step 2:
  "What happens?"
  [ Neither advances ]  [ All advance ]

Step 3 (only if all_advance + 2+ combatants drawing):
  "Merge into a new combatant?"
  [ Merge ]  [ No merge, all just win ]

Step 4 (if merge):
  "Who controls the merged combatant?"
  Tap to select one owner from those in the draw

Step 5 (if merge):
  Merge form — primary owner (or host) fills in:
    Name field
    Bio field (with parent bio collapsible cards above as reference)
    mergeNote field (optional, skippable)
```

With 2 combatants + `no_advance`: no extra steps, same behavior as today.

### gameLogic.js changes

| Function | Change |
|---|---|
| `applyDraw(room, round)` | Read `round.draw.combatantIds` for subset; non-draw combatants get a loss; handle `all_advance` → wins instead of draws |
| `undoRound(room, round)` | Handle merge outcome — reverse wins on all parents; handle partial draw |
| `buildChainEvolutionStory` | Handle `round.merge` nodes — emit "merged with X, Y, and Z to become W" |
| `getLineageStats` | Traverse `coParentIds` links so a merged combatant's stats roll up through all lineage branches correctly |
| NEW: `applyMerge(room, round)` | Applies win stats to all N merge parents, records battles on each — mirrors `applyWinner` but for N combatants |

### Backward compatibility

- `round.draw === true` (old boolean) is treated as `{ combatantIds: allIds, outcome: 'no_advance' }`
- All existing draw records display and score identically to today
- No data migration needed — the read path handles both shapes

### Suggested build order

1. `applyDraw` + `undoRound` — partial draw support (schema change + logic only, no UI yet)
2. Draw outcome (`no_advance` / `all_advance`) — adds win-credit path through draws
3. VoteScreen multi-step draw flow — UI for steps 1 and 2
4. Merge evolution — new `applyMerge`, lineage `coParentIds`, `round.merge` schema, `EvolutionForm` reuse for naming
5. The Cast / story updates — `buildChainEvolutionStory` merge nodes, co-owner display on combatant detail page, `mergeNote` caption display

---

## Release Roadmap

The canonical progression is: round → game → series → season → league.
Full definitions and end-condition matrix: [docs/glossary.md](glossary.md).

### Auth note (applies to all releases)

The app uses PIN-based auth rather than Supabase Auth tokens, so `auth.uid()` RLS policies won't work for stash/visibility filtering. Visibility enforcement is at the query layer: stashed rows are only fetched when querying with the owner's `userId`. Acceptable for a trusted friend-group app. Don't build RLS policies that depend on Supabase Auth until/unless the auth model changes.

---

### 1.1.x — Foundation: Terminology, Tags, Combatants 2.0, The Workshop (Combatants)

The prerequisite release. Everything in 1.2.x and beyond builds on this schema and these systems. Nothing in 1.2.x starts until this ships.

#### Refactoring (do this first)

- ~~Retire "battle" and "tournament" as technical terms~~ ✓ done
- ~~Retire "Bestiary", "Battle History", "The Forge" from all UI copy~~ ✓ done
- ~~File renames: BestiaryScreen → CastScreen, HistoryScreen → ChroniclesScreen~~ ✓ done

Remaining refactor work:
- Confirm no "season" or "league" language appears prematurely in UI strings
- Confirm "battle" and "tournament" are fully retired from all variable names and comments

#### Schema migration (prerequisite — nothing else in this release ships without it)

**combatants table:**
- Add `source text` — `'game' | 'created'`, default `'game'` for all existing rows
- Add `status text` — `'stashed' | 'published'`
- Migrate existing `published` boolean: `true → 'published'`, `false → 'stashed'`
- Drop `published` column after migration
- Add `tags text[]`
- Add `mvp_record jsonb` — array of `{ gameCode, voteShare, coMvp }`. Replaces the previously planned `mvp_votes int`. Default empty array for existing rows.
- Populate `bio_history` on bio edits (the column exists; it's not being written to)

**New tables:**
- `groups(id, name, description, owner_id, owner_name, status, tags, created_at, updated_at)`
- `combatant_groups(combatant_id, group_id, added_at, added_by)`
- `arenas(id, name, bio, rules, owner_id, owner_name, status, tags, created_at, updated_at)` — schema only, no arena feature work in this release. Created here so foreign keys and joins are available when arena work begins in 1.2.x.

#### Tags

Free-form text. Lowercase, no special characters, spaces allowed. Applied at creation or edit time. Not required.

- Displayed as chips/badges on cards and detail pages
- Autocomplete suggestions with free-form fallback
- Tags apply to combatants, arenas, and groups — independent tag spaces per entity type for now
- Super Host capability: merge duplicate tags after the fact (e.g. "spooky" + "spoooky") — applied to all affected records. Super Host role is defined in 1.2.x but the merge operation is built here alongside the tags system
- The Cast becomes searchable and filterable by combatant tag once this ships

#### Combatants 2.0

**Bio history:**
- Every bio edit appends the previous bio to `bio_history` with a timestamp and the userId/name of who made the change
- Collapsible "bio log" on combatant detail page — reverse-chronological, no diffs, no rollback UI

**Ephemeral / topical tags (system-derived, not user-applied):**
- On fire — won 3+ rounds in a row. Badge shows count if streak extends (4+, 5+, …)
- Cold streak — lost 3+ in a row
- Trapper — flag for successful trap combatant record
- These are derived from match history. Not stored. Not permanent.

**Achievement superlatives:**
- Not displayed on small cards. Visible on combatant detail page only.
- Specific superlatives defined once the stat system has enough data to draw from.

**MVP record:**
- `mvp_record` added in schema migration above. Collect the data now.
- Voting UI and The Cast display ship in 1.3.x.

#### The Workshop — Phase 1 (Combatants)

Logged-in users only. Guests who try to access see a single-tap login prompt — not a wall.

**The Stash:**
- Default state for everything created in The Workshop
- Stashed items are only visible to the owner: in The Workshop, in their profile, and in their own draft autocomplete
- Stashed items can be freely edited and deleted
- Once published, deletion is not allowed — it's part of the record
- Publishing is reversible (un-publish back to stash) but doesn't erase history. If the item was ever used in a completed game, it remains accessible through that game's record regardless of stash status

**Create-a-Combatant:**
- Name (required), bio (required — even a single line), tags (optional), group memberships (optional), stash/publish toggle

**My Workshop:**
- All combatants the user has created — stashed and published
- Filter tabs: All / Stashed / Published
- Quick actions: Edit, Publish, Un-publish, Delete (stashed only)

**Edit flow:**
- Bio edits append the previous bio to `bio_history`
- Stashed: free editing, no confirmation
- Published: one-step confirm on bio save — it's now public

**Draft autocomplete integration:**
- Logged-in user's stashed combatants appear in their own autocomplete suggestions
- Visual indicator (lock icon or "stashed" label) distinguishes them from the published pool
- Other players in the same draft do not see these suggestions

**Publish-on-game-completion:**
- When a stashed combatant appears in a completed game, it auto-publishes on room end
- If a game is abandoned before completion, stashed combatants revert to stash — no auto-deletion

---

### 1.2.x — Game Objects: Arenas, Groups, Super Hosts, Hall of Fame, The Archive, Open Lobbies

Builds on the schema shipped in 1.1.x.

#### Scope decision required before arena work begins

- A. Is an arena set at the game level (one arena for the whole session) or at the round level (each round can have its own arena)?
- B. Can both be true — a default arena for the game, overrideable per round?

This decision drives the round and room schema. All arena feature work and The Workshop: Create-an-Arena are blocked until it's resolved.

#### Arenas

- An arena is an optional context for a fight: name, description, and optional house rules in free text. Not enforced by the app — narrative flavour and a prompt for the players.
- Arena data is denormalized into the round or room at the time it's selected. If the arena is later edited, the fight record still shows what the arena was when they fought.
- Players can like or dislike an arena after playing in it. Running count visible on the arena detail page.
- All arenas remain permanently selectable. Enough dislikes relative to likes (threshold TBD) soft-removes the arena from curated preset pools. The record stays. No arena is deleted.

**Preset pools (for random selection):**
- `standard` — general-purpose arenas
- `wacky` — high chaos / absurdist
- `league` — arenas suited for a series home venue
- `weighted-liked` — community-driven; arenas with too many dislikes suppressed automatically

**Lobby options:**
- Host can select a specific arena or trigger random from a chosen preset pool
- One arena for the whole game, or random per round — pending scope decision
- Previous arena from the same series can optionally be excluded to avoid repetition

**Deferred:** editing an arena's description for a one-off session without permanently altering the original requires a fork/override design decision. Don't build until resolved.

**The Workshop: Create-an-Arena** (gated on scope decision above):
- Name, bio, house rules, tags, stash/publish toggle
- My Workshop entry — same stash/publish/edit/delete patterns as combatants
- Publish-on-game-completion applies

#### Groups

A named collective that combatants can belong to. Zero or multiple groups per combatant. Examples: "Clown School", "Local Cryptids", "Cursed Object Hall of Fame".

- When two members of the same group face off, that's a narrative event — the app surfaces it in the round view and ticker
- Groups accumulate history across games, not just within one
- Follows the same stash/publish rules as combatants and arenas
- Either the combatant owner or the group owner can create the membership link
- When a combatant evolves, the variant inherits group memberships
- Stashed group memberships are invisible to anyone but the owner

**Display:**
- Group badges on combatant cards and detail pages
- Round view: "civil war" or "group rivalry" flag when both combatants share a group
- The Archive group view: members, combined record, most decorated member

**The Workshop: Create-a-Group:**
- Name (required), description (required — what's the joke, what's the theme), tags (optional), stash/publish toggle
- Member management: add/remove combatants (own or published)
- When a stashed combatant is deleted, all `combatant_groups` rows for that combatant are removed

**Open questions:**
- Can a group be "locked" so only the owner can add members? Table for now.
- Can arenas belong to a group ("Clown School has a home arena")? Fun idea, low priority.

#### Super Hosts

A trusted user role for game and narrative-level changes made outside of games. Assigned by app admin. Global role — not per-room.

**Powers:**
- Apply, remove, and edit tags on any published combatant, arena, or group
- Assign and remove combatants from any group
- Build and curate arena presets
- Merge duplicate tags across all affected records
- Induct and remove combatants from the Hall of Fame

**What Super Hosts are not:**
- Not a moderation role — no flagging, no approval flows
- Not a host override — they cannot control games in progress or alter round outcomes

#### Hall of Fame (first pass)

A permanent distinction for any published combatant, granted by Super Host induction. Independent of awards cycles — no game or series needs to have just ended. The badge is ceremonial; it carries no gameplay effect.

**Schema additions to combatants:**
- `hall_of_fame bool` — default false
- `inducted_at timestamptz` — set on induction, preserved on removal
- `inducted_by text` — Super Host name, denormalized
- `induction_note text` — optional, one line
- `removed_at timestamptz` — set on removal, null if currently inducted
- `removed_by text` — null if currently inducted

**Display:**
- Dedicated Hall of Fame section in The Archive — feels ceremonial
- Inducted combatants show a badge on their Cast entry card and detail page
- Combatant detail page: "Inducted [date] by [Super Host name]" with optional note
- If removed: badge hidden, induction record still visible as historical record

**Future pass:** league-level voted award path — deferred until leagues ship in 1.4.x.

#### The Archive

Tabbed destination screen. The Cast is the default tab.

- Tabs: The Cast (default), Groups, Arenas, Tags
- Unified search bar at Archive level — searches across all entity types simultaneously
- Tag filtering applies across all tabs
- Groups tab: named collectives, member list, combined win/loss record, most decorated member
- Arenas tab: all published arenas, filterable by tag and preset pool
- Tags tab: browse all tags across entity types

Home screen nav: "The Archive" replaces "The Cast" button. "The Chronicles" replaces "Game History". "My Workshop" nav item added.

#### Open Lobbies

- Option at lobby creation: make the lobby public
- Public lobby browser in the join flow: sortable list, default sorted by times played with host
- Joining a public lobby follows the same flow as joining via invite code

---

### 1.3.x — Season + Awards System

Builds on the clean terminology and series concept from 1.1.x. Season is the layer above series: a structured container with a fixed player roster, declared series count, cumulative standings, and end-of-season awards. No heritage carryover between series — each series starts fresh.

#### Schema

**`seasons` table:**
```sql
id, name,
league_id (nullable — supports standalone seasons),
owner_id, owner_name,
status ('active' | 'ended' | 'cancelled'),
series_count (declared target),
series_played (running count),
latest_evolutions_only (boolean — stored now, enforcement deferred),
created_at, updated_at
```

#### Season features

- Season creation flow: name, player roster (explicit opt-in), declared series count, "latest evolutions only" toggle (stored at creation; enforcement deferred)
- Season standings page: cumulative round wins / losses / draws per player across all series
- Auto-close when `series_played` reaches `series_count` at the end of a series
- Manual early-close available to season creator between series only. A season cannot be closed mid-series
- Season resume: creates a new fresh series under the same `season_id`. No heritage carryover
- A season can designate a home arena — a recurring venue for the run

**Deferred:** "latest evolutions only" enforcement — store the setting at season creation, implement draft-time lock in a follow-up once complexity is fully assessed.

#### Awards system

The single shared awards engine used at every layer. Built here, reused for leagues in 1.4.x. Awards are permanent record — they do not affect gameplay mechanics.

**Schema:**

```sql
-- awards table
id, type, layer, scope_id, scope_type,
recipient_id, recipient_type, recipient_name,
value, co_award bool, awarded_at, created_at

-- type: 'most_wins' | 'mvp' | 'favorite_combatant' | 'best_evolution' | …
-- layer: 'game' | 'series' | 'season' | 'league'
-- recipient_type: 'combatant' | 'player'
-- value: optional numeric for stat-based awards
-- co_award: true when shared

-- votes table
id, award_id, voter_id, voter_name,
nominee_id, nominee_type, nominee_name,
phase ('nomination' | 'runoff'), cast_at
-- Votes are never deleted — permanent record
```

**Voting engine (pure function in gameLogic.js, fully unit tested):**
- Nomination phase: eligible voters nominate one entry or abstain. Secret ballot.
- Live status strip: count of locked-in voters, names visible, picks hidden. Reuses ConnectionStatus pattern.
- Clear winner → auto-award
- Tie after all lock in → open runoff phase between tied nominees
- Runoff deadlocks or host closes during runoff → co-award, auto-resolve
- Host closes nominations early → resolve with current votes, ties auto co-award
- Host close available at any point once nominations open — cannot cancel, only resolve early

**Automatic awards — game level:**
- Most round wins — player with most winning combatants
- Undefeated — player whose combatants went undefeated
- Shutout — player who lost every round
- Most reactions received — combatant with most total reactions
- Trap sprung — any player who successfully triggered a trap (binary)

**Automatic awards — series level:**
- Most round wins across the series — player level
- Most evolutions triggered — player level
- Longest winning streak — combatant level
- Most evolved — combatant with deepest lineage chain
- Trapper — most traps set, player level
- Efficient trapper — best sprung/set ratio, minimum threshold TBD

**Automatic awards — season level:**
- Most round wins across the season — player level
- Most series wins — player level
- Most evolutions triggered across the season — player level
- Most evolved combatant — deepest lineage chain
- Most reactive combatant — most total reactions across the season
- Trap master — most traps set across the season
- Efficient trapper — best ratio across the season
- Most MVPs awarded — combatant with most MVP awards across the season

**Voted awards — game level (MVP):**
- Trigger: available on game end screen, optional. First nomination opens the process — cannot cancel, only close early.
- Nomination pool: round winners by default; full game roster as secondary dropdown for memorable losers.
- Record: append to `mvp_record` on combatant — `{ gameCode, voteShare, coMvp }`
- Display: "MVP in [game code] — [X]% of the vote" per entry on combatant detail page

**Voted awards — series level:**
- Best combatant of the series — nomination pool: all combatants that appeared in the series
- Best evolution — nomination pool: all evolutions that occurred in the series
- Trigger: available at series close, optional

**Voted awards — season level:**
- Favorite combatant — nomination pool: all combatants that appeared in any game in the season
- Most creative combatant — same nomination pool
- Best evolution of the season — nomination pool: all evolutions across the season
- Trigger: opens automatically on season close; ballot open until all votes cast or season creator closes

**Awards display:**
- Awards visible on combatant detail page in The Cast — grouped by layer, chronological
- Awards visible on player profile — career awards summary
- Series awards visible in The Chronicles on the series record
- Season awards visible in The Chronicles on the season record
- Automatic awards computed and displayed immediately on close
- Voted awards displayed once resolved — pending state shown while ballot is open

---

### 1.4.x — League

Builds on the season layer from 1.3.x. League is the top tier: a persistent named group that runs multiple seasons with cumulative standings. Each new season starts fresh — no heritage carryover between seasons.

#### Schema

```sql
leagues(
  id, name,
  owner_id, owner_name,
  status ('active' | 'ended' | 'cancelled'),
  season_count (declared target),
  seasons_played (running count),
  efficient_trapper_min_threshold int (default 3),
  created_at, updated_at
)
```

#### League features

- League creation: name, player roster (explicit opt-in), declared season count
- League standings: cumulative stats and notable moments across all seasons
- Auto-close when `seasons_played` reaches `season_count` at end of a season
- Manual early-close between seasons only. Cannot close mid-season
- League resume: creates a new fresh season. No carryover

**Automatic awards — league level:**
- Most round wins — cumulative across all seasons, player level
- Most season wins — player level
- Most evolutions ever — player level, full league history
- Most evolved — combatant with deepest lineage chain in league
- Most decorated — most combined wins, reactions, and MVPs, combatant level
- Iron trapper — most traps set across the entire league
- Most appearances — combatant entered in most games across the league

**Voted awards — league level:**
- Hall of Fame — first pass is Super Host induction (1.2.x). Future pass: voted at league close. Multiple inductees allowed.
- Best evolution ever — single most memorable evolution across league history
- Most legendary player — the player the group feels defined the league. Opens automatically on league close.

---

### 1.5.x — Docs & UX Pass

Dedicated pass to bring all user-facing and contributor-facing documentation in sync with what actually shipped. No new features. No schema changes.

- **user-guide.md:** update all terminology, flow descriptions, and remove any remaining references to retired terms
- **HelpModal.jsx:** full content audit against shipped features. Tone pass — voice should match the app, not a manual
- **In-app onboarding copy, empty states, placeholder text:** audit for stale references and terminology drift
- **CLAUDE.md:** audit against what actually shipped — remove anything that no longer reflects the codebase

---

### 1.6.x — Users Lounge (Vision)

A vision, not a spec. A dedicated design doc is needed before any of this is planned for implementation.

**User decks:**
- Combatants released periodically as collectible trading cards, exclusive to the Users Lounge
- Cards are 1 of 1 — open question: how does uniqueness work when a combatant appears in multiple games? Must be resolved before building
- Draft, trade, and wagering mechanics each need their own design pass

**Minigames:**
- Narrative games (history not kept by default): Airplane, Football, others TBD
- "8s with your deck" — select 8 cards from your deck and run a game. Could be recorded as a minigame stat
