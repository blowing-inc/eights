glossary
last updated: 2026-04-28

The canonical definitions for all game layers, lifecycle states, and structural
concepts. This is the reference document. When a term here conflicts with UI
copy, code comments, or a design doc, this file wins.

---

LAYERS

Round
  A single matchup. One combatant per player, one vote, one result. The atomic
  unit of the game.
  End conditions:
    resolved — winner declared, or draw called
    cancelled — no record left; the round did not happen
  Notes:
    There is no "end early" for a round. It either resolves or is cancelled.

Game
  A full session: one draft, one set of rounds played to completion, one room.
  End conditions:
    completed — all rounds played and resolved
    cancelled — no-contest; combatants in this game stay unpublished
  Notes:
    There is no meaningful "end early" for a game. A partial game is a
    cancelled game. The host can delete a game only as a last resort when a
    guest-session breakdown makes the room unrecoverable.
    An optional MVP vote is available at game end — any player may nominate a
    combatant, the group votes secretly, and the result is recorded permanently
    on the combatant's record.

Series
  A chain of connected games where champions from each game are enforced entries
  in the next draft, and evolved forms carry forward as the canonical version of
  that combatant.
  End conditions:
    completed — reaches its natural end when the group decides to stop continuing
    ended early — paused mid-chain; can be resumed
    cancelled — no-contest
  Resume behaviour:
    Creates a new game carrying forward prev winners and evolved forms from the
    last completed game in the chain.
  Notes:
    No hard game cap. Runs as long as the group keeps continuing it.

Season
  A structured container of series played by a fixed group of players. Defines
  a window for cumulative standings and end-of-season awards. Series within a
  season start fresh — no enforced champions, no heritage carryover between
  series. Players draft freely from their full personal bestiary.
  End conditions:
    completed — series_played reaches the declared series_count, at end of a series
    ended early — paused between series; can be resumed
    cancelled — no-contest
  Resume behaviour:
    Creates a new fresh series under the same season_id. No prev winners or
    heritage carryover. series_played increments.
  Notes:
    The series count is declared at season creation but can be closed early
    between series by the season creator. A season cannot be closed mid-series.

  Deferred: "Latest evolutions only" option
    When enabled, a player cannot draft an earlier form of a combatant that has
    since evolved within this season's history. The lock is scoped to the
    season — not global. The current tip form is the only draftable version of
    that character within the season's continuity.
    Status: store the setting at season creation; enforce in a follow-up once
    complexity is assessed.

League
  A persistent named group with a fixed player roster that runs multiple seasons.
  Tracks cumulative standings across seasons. Each new season starts fresh.
  End conditions:
    completed — seasons_played reaches the declared season_count, at end of a season
    ended early — paused between seasons; can be resumed
    cancelled — no-contest
  Resume behaviour:
    Creates a new fresh season under the same league. No carryover.
  Notes:
    A league does not close mid-season.

---

END CONDITION MATRIX

  Layer    | End Early            | Cancel | Resume
  ---------|----------------------|--------|---------------------------
  Round    | No                   | Yes    | No
  Game     | No                   | Yes    | No
  Series   | Yes (between games)  | Yes    | Yes → new game
  Season   | Yes (between series) | Yes    | Yes → new series
  League   | Yes (between seasons)| Yes    | Yes → new season

---

RESUME BEHAVIOUR (recursive pattern)

Each layer's resume creates a new instance of the layer below it, carrying
forward only what that layer's mechanics define.

  Series resume  → new game, carries forward prev winners and evolved forms
  Season resume  → new series, fresh draft, no enforced carryover
  League resume  → new season, fresh draft, no enforced carryover

---

AUTHORITY

The creator of each layer owns its lifecycle decisions: closing early,
cancelling, and resuming. This mirrors the host authority pattern established
at the game level.

  Layer     | Authority
  ----------|------------------------
  Round     | Host
  Game      | Host
  Series    | Series creator (usually host of first game)
  Season    | Season creator
  League    | League creator

---

ROOM SETTINGS

Settings stored on a room at creation. All are booleans unless noted.
Defaults enforced by normalizeRoomSettings in gameLogic.js.

  rosterSize         integer  default: 8     Combatants each player drafts; determines round count.
  spectatorsAllowed  boolean  default: true  When true, a separate spectate link is available in the lobby.
  anonymousCombatants boolean default: false When true, owner names are hidden during voting.
  blindVoting        boolean  default: false When true, votes are hidden until all players have submitted.
  biosRequired       boolean  default: false When true, players must write a bio before locking their draft.
  allowEvolutions    boolean  default: true  When false, the Evolve option is hidden after wins; winners confirm as-is.
  allowDraws         boolean  default: true  When false, the host cannot declare a draw — only winner confirmation is available.
  allowMerges        boolean  default: true  When false, draws cannot trigger a merge flow even if allowDraws is on.

---

COMBATANTS

Combatant
  Any named character that enters a game. The atomic story unit of the world.
  Every combatant has a name, a bio, a win/loss record, and may carry lineage,
  tags, group memberships, reactions, and an MVP record. Two creation paths:

  source: 'game'
    Entered by a player at draft time, directly into a draft field. The default
    path. Combatant enters the world through play.

  source: 'created'
    Built in The Workshop before any game. Private to the owner until published.

Status
  Every combatant is in one of two states:

  stashed
    Private. Visible only to the owner — in The Workshop, in their draft
    autocomplete, and nowhere else. Can be freely edited and deleted.

  published
    Part of the permanent record. Visible in The Cast to all players. Deletion
    is not allowed once published. Un-publishing back to stash is allowed, but
    the combatant's game history remains accessible through completed game
    records regardless of stash status.

Publish-on-game-completion
  When a stashed combatant appears in a completed game, it auto-publishes at
  room close. A completed game is a permanent record — a combatant that fought
  is part of the story. Keeping it stashed after the fact would create a gap
  in The Cast. If the game is abandoned before completion, the combatant
  reverts to stash. No auto-deletion. Stash is the safe holding state.

The Stash
  The default state for everything created in The Workshop. Stashed items are
  private to their owner. They can be freely edited and deleted. The stash is
  the creative workspace before the world sees the work.

Bio History
  Every bio edit appends the previous bio to bio_history with a timestamp and
  the userId/name of who made the change. The bio log is visible as a
  collapsible section on the combatant detail page — reverse-chronological, no
  diffs, no rollback UI. A combatant whose bio has mutated across games is
  itself a story. The log IS the narrative artifact. Stashed combatants can be
  edited freely; published combatants require a one-step confirm on bio save.

Lineage / Evolution
  When a combatant wins a round, the owner (or host) may evolve them into a
  variant: a new combatant with a new name and optional new bio. The variant
  carries lineage metadata linking it back to its ancestor chain.

  lineage fields (on the combatants table):
    rootId     — id of the original combatant at the start of the tree
    parentId   — id of the immediate predecessor
    generation — 0 = original, 1 = first variant, 2 = second, etc.
    bornFrom   — permanent narrative record of what caused this evolution:
                   { opponentName, opponentId, roundNumber, gameCode, parentName }

  bornFrom is required at creation — it is the lineage link that powers
  evolution story display. Never omit it.

  Evolution uniqueness: the proposed variant name must not already exist in the
  combatants table (case-insensitive). Evolution must produce a novel entry.

Heritage Chain
  The series-level carryover mechanism. When a series resumes, champions carry
  forward as enforced draft entries. If a champion has since evolved, their
  current tip form (the latest variant in the lineage) is the canonical version
  that carries forward — not the form that won the previous game. buildActiveFormMap
  handles this substitution at draft time.

Ephemeral Tags (system-derived, not user-applied)
  Computed from recent match history. Not stored. Not permanent. Displayed as
  badges on combatant cards when the condition is active.

    On fire     — won 3+ rounds in a row. Badge shows count if streak extends (4+, 5+, …)
    Cold streak — lost 3+ in a row
    Trapper     — flag for a successful trap combatant record

Achievement Superlatives
  Narrative distinctions derived from a combatant's all-time match history.
  Examples: "beat X opponents", "survived Y games". Not displayed on the small
  card — visible on the combatant detail page only. Specific superlatives
  defined once the stat system has enough data to draw from.

---

TAGS

Tags
  Free-form labels applied to combatants, arenas, and groups. Lowercase, no
  special characters, spaces allowed. Not required — no friction for quick
  games. Displayed as chips/badges on cards and detail pages. Applied at
  creation or edit time with autocomplete suggestions and free-form fallback,
  keeping tags coherent without blocking creativity.

  Tag spaces are independent per entity type (combatants, arenas, groups) for
  now. Revisit unified cross-entity search if that becomes wanted.

  Super Hosts can merge duplicate tags across all affected records after the
  fact — e.g. "spooky" + "spoooky" reconciled globally. The Cast becomes
  searchable and filterable by combatant tag once tags ship (1.1.x).

---

ARENAS

Arena
  An optional context for a fight: name, description (the setting, the vibe,
  the absurdity), and optional house rules in free text. Not enforced by the
  app — narrative flavour and a prompt for the players.

  Arenas follow the same stash/publish lifecycle as combatants and groups.
  Publish-on-game-completion applies: a stashed arena used in a completed game
  auto-publishes on room close.

  Story record: arena data is denormalized into the round or room at the time
  it is selected. If the arena is later edited or deleted, the fight record
  still shows what the arena was when they fought.

Likes and dislikes
  Players can like or dislike an arena after playing in it. Running count
  visible on the arena detail page. All arenas remain permanently selectable.
  Enough dislikes relative to likes (threshold TBD) soft-removes the arena
  from curated preset pools. The record stays. No arena is deleted.

Preset pools (for random selection)
  standard        — general-purpose arenas
  wacky           — high chaos / absurdist
  league          — arenas suited for a series home venue (a recurring location)
  weighted-liked  — community-driven; arenas with enough dislikes are suppressed
                    from this pool automatically
  Presets are compiled through play and curated by Super Hosts.

Scope decision (required before arena work begins)
  A. Is an arena set at the game level (one arena for the whole session) or at
     the round level (each round can have its own arena)?
  B. Can both be true — a default game arena, overrideable per round?
  All arena feature work is blocked until this is resolved.

Deferred: "Tim's house but it's Christmas" case
  Editing an arena's description or rules for a one-off session without
  permanently altering the original requires a decision: fork, one-session
  override, or a separate "this session only" field. Don't build until resolved.

---

GROUPS

Group
  A named collective that combatants can belong to. Zero or multiple groups per
  combatant. Examples: "Clown School", "Local Cryptids", "Cursed Object Hall of
  Fame". Groups accumulate history across games, not just within one.

  Groups follow the same stash/publish lifecycle as combatants and arenas.
  A group's record is derived from the aggregate wins/losses of all its members
  — not stored separately.

Why groups matter for the story
  When two members of the same group face off, that's a narrative event — a
  civil war, a betrayal, a family feud. The app surfaces it in the round view
  and ticker.

Group lifecycle rules
  Either the combatant owner or the group owner can create the membership link.
  When a combatant evolves, the variant inherits group memberships — the variant
  is the same character continued.
  Stashed group memberships are invisible to anyone but the owner. A combatant's
  group list only shows published groups to others.
  When a stashed combatant is deleted, all combatant_groups rows for that
  combatant are removed.

Display
  Group badges on combatant cards and detail pages.
  Round view: "civil war" or "group rivalry" flag when both combatants share a group.
  The Cast group view: members, combined record, most decorated member.

---

SUPER HOSTS

Super Host
  A trusted user role for world-level curation — changes made outside of games.
  Assigned by app admin. Global role — not per-room.

  Powers:
    Apply, remove, and edit tags on any published combatant, arena, or group.
    Assign and remove combatants from any group.
    Build and curate arena presets.
    Merge duplicate tags across all affected records.
    Induct and remove combatants from the Hall of Fame.
    Correct automatic awards (escape hatch for data errors).

  What Super Hosts are not:
    Not a moderation role — no flagging, no approval flows.
    Not a host override — they cannot control games in progress or alter round
    outcomes. The host still runs the game. Super Hosts curate the world outside it.

---

AWARDS

Awards
  Recognitions granted at the conclusion of a game, series, or season. Two
  types: automatic (computed from existing data) and voted (nominated and
  balloted by players). Awards are permanent record — they accumulate on
  combatants and players across their lifetime. Awards do not affect gameplay
  mechanics — they are narrative and historical distinctions only.

Automatic Awards
  Computed from existing data at the close of a game, series, or season. No
  nomination or ballot required. Calculated and assigned immediately on close.
  Cannot be disputed or overridden except by Super Host correction. Full list
  defined per layer in the awards spec in 1.x.x_design.txt.

Voted Awards
  Require a nomination phase and a secret ballot from eligible voters. Eligible
  voters are the players who participated in the game, series, or season being
  awarded. All voted awards share a single voting engine with configurable scope
  — the nomination pool, voter pool, and trigger vary by award but the mechanics
  are identical. See Voting Engine.

Voting Engine
  The single shared system powering all voted awards across every layer.
  Configurable parameters: nomination pool, voter pool, trigger event, and
  resolution behavior. Used for MVP (game level), series awards, season awards,
  and eventually league awards. Built once in 1.3.x, reused at every layer.
  Core mechanics:
    Any eligible voter may nominate one entry from the nomination pool, or abstain.
    Votes are secret until resolution.
    Live status visible to all: count of players who have locked in, names
      shown, picks hidden. Mirrors ConnectionStatus pattern.
    Resolution paths:
      Clear winner → auto-awarded, no prompt
      Tie after all players lock in → tiebreak runoff between tied nominees
      Runoff deadlocks or host closes during runoff → co-award, auto-resolved
      Host closes nominations early → resolve with current votes, ties auto co-award
    Co-awards are valid at every layer — no special distinction, each recipient
      gets full credit.
    Host close is available at any point once nominations open — cannot cancel,
      only resolve early.

MVP
  A voted award at the game level. Recognizes the most valuable or memorable
  combatant of a single game. Optional — only triggered if at least one player
  nominates. Nomination pool: round winners by default, full game roster
  available as secondary for memorable losers. Recorded on the combatant's
  mvp_record with game code, vote share percentage, and co-MVP flag. Displayed
  on combatant detail page in The Cast.

Hall of Fame
  A permanent distinction available to any published combatant, independent of
  awards cycles. First pass: granted by Super Host induction with an optional
  induction note. Future pass: granted by league-level voted award. Inducted
  combatants receive a permanent badge on their Cast entry. Induction is
  recorded with date, Super Host name, and optional note. Removal is possible
  via Super Host as an escape hatch — the induction record is preserved even
  after removal, consistent with the Data Conservative principle.

---

CANONICAL DESTINATION NAMES

The Chronicles
  The sequential record of everything that happened. Contains games, series,
  seasons, and leagues in the order they occurred. Used to relive a specific
  game, continue a series, review standings, or reconstruct the story of a
  season. The name implies ordered narrative — sequences of events, exactly
  what you find. Replaces "Battle History." Home screen nav destination.

The Archive
  The world-browsing destination. Contains The Cast, Groups, Arenas, and Tags
  under one roof with unified search across all entity types. Used to explore
  the accumulated world the games have built — who fought, where they fought,
  what groups they belonged to, what tags connect them. Replaces the unnamed
  "Compendium" placeholder. Home screen nav destination.

The Cast
  The permanent record of every combatant who has ever performed in a game.
  Lives inside The Archive as its primary tab. Every combatant has an entry —
  bio, stats, lineage, group memberships, reactions, MVP record, evolution
  history. Searchable and filterable by tag, group, and player within The
  Archive. Replaces "Bestiary."

The Workshop
  The private creation space for logged-in users. Combatants, groups, and
  arenas are made here before they enter the world. Items live in the Stash
  until published or until a completed game auto-publishes them. Replaces "The
  Forge." Home screen nav destination.

The Fight Card
  Flavor name for the draft screen — the game-flow moment when players assemble
  their roster before a game begins. Not a home screen nav destination. Appears
  as atmospheric naming on the draft screen itself. A fight card is the official
  pre-event document listing every participant — which is exactly what the draft
  produces. Cosmetic copy only. Draft screen component names and internal
  references unchanged.

Home screen nav (canonical):
  Create a room
  Join a room
  The Chronicles
  The Archive
  The Workshop

---

RETIRED TERMS

  "battle"       → use "round" (single match) or "game" (full session)
  "tournament"   → use "game" or "series"
  "Bestiary"     → UI destination retired. Replaced by The Cast (primary tab inside The Archive)
  "Battle History" → UI destination retired. Replaced by The Chronicles
  "The Forge"    → UI destination retired. Replaced by The Workshop

---

CANONICAL PROGRESSION

  round → game → series → season → league
