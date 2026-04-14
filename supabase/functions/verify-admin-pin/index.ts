// Edge Function: verify-admin-pin
//
// POST { pin: string } → { token: string } on match, 401 on mismatch.
//
// The PIN lives in Supabase secrets (never in the client bundle):
//   supabase secrets set ADMIN_PIN=your-pin
//
// The returned token is a signed payload: base64url(JSON{exp}).hmacSig
// The client stores it in sessionStorage and checks exp to avoid stale sessions.
// Phase 2: admin Edge Functions can re-verify the signature before executing
// destructive operations.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SESSION_TTL_MS = 8 * 60 * 60 * 1000 // 8 hours

// ─── Rate limiter ─────────────────────────────────────────────────────────────
// In-memory per-IP tracking. Persists across warm invocations of the same
// instance; resets on cold start. Sufficient to defeat single-source brute
// force — a 5-digit PIN has 100k combinations and this limits to 5 attempts
// per 15 minutes per IP.

const MAX_ATTEMPTS = 5
const WINDOW_MS    = 15 * 60 * 1000 // 15 minutes

const ipAttempts = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now   = Date.now()
  const entry = ipAttempts.get(ip)

  if (!entry || now > entry.resetAt) {
    ipAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return { allowed: true }
  }
  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
  }
  entry.count++
  return { allowed: true }
}

function clearRateLimit(ip: string) {
  ipAttempts.delete(ip)
}

// ─── Crypto helpers ───────────────────────────────────────────────────────────

async function hmacSign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function b64urlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS })
  }

  // x-forwarded-for is set by Cloudflare (Supabase's edge network).
  // Fall back to a fixed string so local dev doesn't break.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'

  const { allowed, retryAfter } = checkRateLimit(ip)
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Too many attempts. Try again later.' }), {
      status: 429,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
      },
    })
  }

  const adminPin = Deno.env.get('ADMIN_PIN')?.trim()
  if (!adminPin) {
    console.error('ADMIN_PIN secret is not set')
    return new Response(JSON.stringify({ error: 'Server misconfigured.' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  let pin: string
  try {
    const body = await req.json()
    pin = String(body.pin ?? '').trim()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  if (!pin || pin !== adminPin) {
    return new Response(JSON.stringify({ error: 'Wrong admin PIN.' }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  // Correct PIN — clear the rate limit counter so the owner doesn't get locked
  // out after a few mistyped entries earlier in the same window.
  clearRateLimit(ip)

  // Signed session token: base64url(payload).hmac(payload, adminPin)
  // Phase 2 admin functions can re-verify the signature without a DB round-trip.
  const payload = b64urlEncode(JSON.stringify({ exp: Date.now() + SESSION_TTL_MS }))
  const sig     = await hmacSign(payload, adminPin)
  const token   = `${payload}.${sig}`

  return new Response(JSON.stringify({ token }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
})
