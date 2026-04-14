glossary
last updated: 2026-04-14

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
    There is no meaningful "end early" for a Wgame. A partial game is a
    cancelled game. The host can delete a game only as a last resort when a
    guest-session breakdown makes the room unrecoverable.
    An optional MVP vote is available at game end — any player may nominate a combatant, the group votes secretly, and the result is recorded permanently on the combatant's record.

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

  Layer    | End Early          | Cancel | Resume
  ---------|--------------------|--------|---------------------------
  Round    | No                 | Yes    | No
  Game     | No                 | Yes    | No
  Series   | Yes (between games)| Yes    | Yes → new game
  Season   | Yes (between series)| Yes   | Yes → new series
  League   | Yes (between seasons)| Yes  | Yes → new season

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

RETIRED TERMS

  "battle"       → use "round" (single match) or "game" (full session)
  "tournament"   → use "game" or "series"
  "Bestiary"     → UI destination retired. Replaced by The Cast (primary tab inside The Archive)
  "Battle History" → UI destination retired. Replaced by The Chronicles
  "The Forge"    → UI destination retired. Replaced by The Workshop

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

CANONICAL PROGRESSION

  round → game → series → season → league
