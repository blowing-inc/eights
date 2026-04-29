// Edge Function: admin-action
//
// Single dispatcher for all admin write operations. Verifies the session token
// produced by verify-admin-pin, then executes the action using the service role
// key (which bypasses RLS, enabling deletes that the anon key cannot perform).
//
// JWT verification must be disabled for this function in the Supabase dashboard
// (same as verify-admin-pin) — the token check here is the auth layer.
//
// POST { action: string, token: string, params: object }
//
// Actions:
//   reset-user-pin    { username }
//   set-super-host    { userId, isSuperHost }
//   merge-users       { roomUpdates, dropUserId, keepId }
//   link-guest        { roomUpdates, guestId, userId, ownerName }
//   delete-combatant  { id }
//   update-combatant  { id, updates }
//   set-combatant-stats { id, wins, losses, heart, angry, cry }
//   delete-game       { roomId }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ─── Token verification ───────────────────────────────────────────────────────
// Mirrors the signing logic in verify-admin-pin. Stateless — no DB round-trip.

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

async function verifyAdminToken(token: string, adminPin: string): Promise<boolean> {
  try {
    const [payload, sig] = token.split('.')
    if (!payload || !sig) return false
    const expectedSig = await hmacSign(payload, adminPin)
    if (sig !== expectedSig) return false
    const { exp } = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return Date.now() < exp
  } catch {
    return false
  }
}

// ─── Response helpers ─────────────────────────────────────────────────────────

function ok() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function err(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return err('Method not allowed', 405)

  const adminPin = Deno.env.get('ADMIN_PIN')?.trim()
  if (!adminPin) {
    console.error('ADMIN_PIN secret is not set')
    return err('Server misconfigured.', 500)
  }

  let action: string, token: string, params: Record<string, unknown>
  try {
    const body = await req.json()
    action = String(body.action ?? '')
    token  = String(body.token ?? '')
    params = body.params ?? {}
  } catch {
    return err('Invalid request body.')
  }

  if (!await verifyAdminToken(token, adminPin)) {
    return err('Invalid or expired admin session.', 401)
  }

  // Service role client — bypasses RLS, enabling deletes and unrestricted writes.
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    switch (action) {

      // ── Users ──────────────────────────────────────────────────────────────

      case 'reset-user-pin': {
        const { username } = params as { username: string }
        const { error } = await db.from('users')
          .update({ needs_reset: true, updated_at: new Date().toISOString() })
          .ilike('username', username)
        if (error) throw error
        return ok()
      }

      case 'set-super-host': {
        const { userId, isSuperHost } = params as { userId: string; isSuperHost: boolean }
        const { error } = await db.from('users')
          .update({ is_super_host: isSuperHost, updated_at: new Date().toISOString() })
          .eq('id', userId)
        if (error) throw error
        return ok()
      }

      case 'merge-users': {
        // Client pre-computes room transforms via applyMergeToRoom (pure fn).
        // We receive the finished payloads and only execute the writes here.
        const { roomUpdates, dropUserId, keepId } = params as {
          roomUpdates: { id: string; data: unknown }[]
          dropUserId: string
          keepId: string
        }
        for (const { id, data } of roomUpdates) {
          const { error } = await db.from('rooms')
            .update({ data, updated_at: new Date().toISOString() })
            .eq('id', id)
          if (error) throw error
        }
        const { error: cErr } = await db.from('combatants')
          .update({ owner_id: keepId, updated_at: new Date().toISOString() })
          .eq('owner_id', dropUserId)
        if (cErr) throw cErr
        const { error: uErr } = await db.from('users').delete().eq('id', dropUserId)
        if (uErr) throw uErr
        return ok()
      }

      case 'link-guest': {
        // Client pre-computes room transforms via replacePlayerIdInRoom (pure fn).
        const { roomUpdates, guestId, userId, ownerName } = params as {
          roomUpdates: { id: string; data: unknown }[]
          guestId: string
          userId: string
          ownerName: string
        }
        for (const { id, data } of roomUpdates) {
          const { error } = await db.from('rooms')
            .update({ data, updated_at: new Date().toISOString() })
            .eq('id', id)
          if (error) throw error
        }
        const { error: cErr } = await db.from('combatants')
          .update({ owner_id: userId, owner_name: ownerName, updated_at: new Date().toISOString() })
          .eq('owner_id', guestId)
        if (cErr) throw cErr
        return ok()
      }

      // ── Combatants ─────────────────────────────────────────────────────────

      case 'delete-combatant': {
        const { id } = params as { id: string }
        const { error } = await db.from('combatants').delete().eq('id', id)
        if (error) throw error
        return ok()
      }

      case 'update-combatant': {
        const { id, updates } = params as { id: string; updates: Record<string, unknown> }
        const { error } = await db.from('combatants')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', id)
        if (error) throw error
        return ok()
      }

      case 'set-combatant-stats': {
        const { id, wins, losses, heart, angry, cry } = params as {
          id: string; wins: number; losses: number; heart: number; angry: number; cry: number
        }
        const { error } = await db.from('combatants').update({
          wins, losses,
          reactions_heart: heart,
          reactions_angry: angry,
          reactions_cry:   cry,
          updated_at: new Date().toISOString(),
        }).eq('id', id)
        if (error) throw error
        return ok()
      }

      // ── Games ──────────────────────────────────────────────────────────────

      case 'delete-game': {
        const { roomId } = params as { roomId: string }
        const { error } = await db.from('rooms').delete().eq('id', roomId)
        if (error) throw error
        return ok()
      }

      default:
        return err(`Unknown action: ${action}`)
    }

  } catch (e) {
    console.error(`admin-action "${action}" failed:`, e)
    return err('Action failed.', 500)
  }
})
