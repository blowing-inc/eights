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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS })
  }

  const adminPin = Deno.env.get('ADMIN_PIN')
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
    pin = String(body.pin ?? '')
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

  // Signed session token: base64url(payload).hmac(payload, adminPin)
  // Phase 2 admin functions can re-verify the signature without a DB round-trip.
  const payload = b64urlEncode(JSON.stringify({ exp: Date.now() + SESSION_TTL_MS }))
  const sig     = await hmacSign(payload, adminPin)
  const token   = `${payload}.${sig}`

  return new Response(JSON.stringify({ token }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
})
