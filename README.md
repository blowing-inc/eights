# ⚔️ Eights

> The game of improbable battles.

Each player secretly drafts a roster of combatants — fictional characters, inside jokes, real people, abstract concepts. Reveal them one round at a time, vote, and the host picks the winner. Everything that happens is saved permanently: combatants, winners, reactions, chat, evolutions. The goal isn't just to win — it's to end up with a record of something that happened between real people that you can read back years later and still laugh.

---

## Stack

- **Vite + React** — frontend
- **Supabase** — persistent storage (Postgres, free tier is plenty)
- **Cloudflare Pages** — production hosting via the shared `team-play.city` infrastructure

---

## Local setup

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/eights.git
cd eights
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free project
2. In the **SQL Editor**, paste and run the contents of `supabase/schema.sql`
3. Go to **Project Settings → API** and copy:
   - **Project URL** (looks like `https://xxxx.supabase.co`)
   - **anon/public key** (the long `eyJ...` string)

### 3. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Deploy to Cloudflare Pages

Production deployment for `https://eights.team-play.city` is managed from the shared infrastructure repository:

- Infra repo: `blowing-inc/team-play-city-infra`
- Cloudflare Pages project: `eights`
- Custom domain: `eights.team-play.city`

Cloudflare Pages builds from `blowing-inc/eights` on pushes to `main`.

### Required Cloudflare Pages environment variables

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

These values are managed by the shared infra repo's Terraform workflow, not in Cloudflare by hand.

### GitHub Actions secrets for this repo

This repository's `CI` workflow builds the production app during pull requests and on `main`, so set these GitHub Actions secrets in `blowing-inc/eights`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### GitHub Actions secrets for the shared infra repo

The shared infra repo also needs the same values so it can configure the Cloudflare Pages project:

- Repo: `blowing-inc/team-play-city-infra`
- Secrets:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

## Deploy to Vercel

```bash
npm install -g vercel
vercel
```

When prompted, add environment variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Or set them in the Vercel dashboard under **Settings → Environment Variables**.

### Deploy to Netlify

```bash
npm run build
# drag the `dist/` folder to netlify.com/drop
```

Or connect your GitHub repo in the Netlify dashboard — set the build command to `npm run build` and publish directory to `dist`. Add the two env vars under **Site settings → Environment variables**.

Cloudflare Pages is the canonical deployment target for `team-play.city` infrastructure. Vercel and Netlify remain optional alternatives for forks or personal deployments.

---

## How to play

### Accounts vs. guests

You can play as a guest by just entering a name. Guests work fine for a single session on one device. Create an account (tap the user icon) to keep your history, open lobbies, and combatants tied to your identity across devices. The host especially should be logged in — if the host loses their session, no one can advance the game.

### Creating a room

Tap **Create a room** and configure your settings:

| Setting | What it does |
|---|---|
| Roster size (3–12) | How many combatants each player drafts; determines the number of rounds |
| Allow spectators | Lets people join via a separate link to watch without playing |
| Anonymous combatants | Hides owner names during voting — useful for unbiased picks |
| Blind voting | Individual votes are hidden until everyone has submitted |
| Bios required | Every combatant must have a bio before the draft locks |

Share the 4-character room code or copy-link buttons to invite players and spectators.

### The draft

Each player fills in their roster privately. Drafts are auto-saved — close the tab and come back, your progress is still there. Lock in when done. No one sees anyone else's combatants until the first round begins.

The host sees a readiness tracker and can **force-start** if most players are ready and someone has gone quiet.

### Battle rounds

The host starts each round. All players vote on the matchup, then the host:
- **Confirms a winner** — locks the result, advances to the next round
- **Declares a draw** — both combatants recorded as draws, no winner
- **Evolves the winner** — see Evolution below
- **Undoes the last round** — available as long as the next round hasn't started

### Evolution

When a combatant wins, the host can evolve them instead of just confirming. The host (or the combatant's owner, if the host delegates) writes a new name and optionally rewrites the bio. The original combatant is preserved exactly as-is. The evolution is recorded permanently: who evolved from whom, who they beat, which game it happened in.

In a series, the evolved form becomes the owner's required pick in the next draft.

### Series play

After a completed tournament, the host can **Continue series** — a new draft with the same players, with evolved champions carried forward as required picks. Series games are grouped together in history with combined standings.

### The Bestiary

Once a tournament completes, all its combatants are published to the global Bestiary — a permanent record of every combatant across all games, searchable by name, bio, or player. Evolved variants show their full lineage: what they evolved from, who they beat, and when.

### Dev mode

Tap **🧪 Dev mode** on the home screen to run a solo game with two bot players. Bot votes don't count — you confirm winners yourself. Good for testing.

---

## Project structure

```
eights/
├── src/
│   ├── App.jsx           # Router, session management, top-level state
│   ├── gameLogic.js      # Pure game logic (no side effects, fully unit-tested)
│   ├── adminLogic.js     # Admin operations (unit-tested)
│   ├── supabase.js       # Supabase client + storage helpers
│   ├── export.js         # Data export utilities
│   ├── main.jsx          # React entry point
│   ├── index.css         # Global styles + CSS variables (light/dark)
│   ├── screens/          # Full-screen React components
│   └── components/       # Shared UI components
├── supabase/
│   └── schema.sql        # Run once in Supabase SQL editor to set up the database
├── public/
│   └── sword.svg         # Favicon
├── .env.example          # Copy to .env and fill in your Supabase keys
├── index.html
├── vite.config.js
└── package.json
```

The game logic lives in `gameLogic.js` and `adminLogic.js` — pure functions with no Supabase imports, no React, no side effects. Everything there is unit-testable in isolation. React components in `screens/` handle display and interaction only; they call these functions and the Supabase helpers, they don't contain business logic inline.

---

## Running tests

```bash
npm test
```
