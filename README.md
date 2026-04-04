# ⚔️ Eights

> The game of improbable battles.

Each player secretly writes 8 combatants. Reveal them one round at a time, deliberate, and the host picks the winner. Anything goes — violence, abstraction, transcendence, vibes.

---

## Stack

- **Vite + React** — frontend
- **Supabase** — persistent storage (Postgres, free tier is plenty)
- **Vercel / Netlify** — recommended hosting (free)

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

---

## How to play

1. **Host** creates a room and shares the 4-letter code
2. **Players** join from their own phones
3. Everyone secretly fills in their **8 combatants** (with optional bios)
4. Once all drafts are submitted, the host reveals rounds one at a time
5. During each round, players tap their pick — the host sees everyone's leanings and confirms the final winner
6. The host can **undo** the last round if you change your minds
7. All combatant stats, bios, and round history are saved permanently

### Dev mode

Hit **🧪 Dev mode** on the home screen to test solo with two bot players. Bot votes don't count — you confirm the winner yourself.

---

## Project structure

```
eights/
├── src/
│   ├── App.jsx          # All game screens and logic
│   ├── supabase.js      # Supabase client + sget/sset storage adapter
│   ├── main.jsx         # React entry point
│   └── index.css        # Global styles + CSS variables (light/dark)
├── supabase/
│   └── schema.sql       # Run once in Supabase SQL editor
├── public/
│   └── sword.svg        # Favicon
├── .env.example         # Copy to .env and fill in keys
├── index.html
├── vite.config.js
└── package.json
```

---

## GitHub setup (first time)

```bash
cd eights
git init
git add .
git commit -m "initial commit"
gh repo create eights --public --push --source=.
```

(Requires [GitHub CLI](https://cli.github.com/). Alternatively create the repo on github.com and follow the push instructions shown there.)
