import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const { email, password, username, inviteCode } = await request.json()
    const expectedInvite = process.env.AURA_INVITE_CODE
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!expectedInvite || !supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Signup is not configured.' }, { status: 503 })
    }
    if (!email || !password || !username || inviteCode !== expectedInvite) {
      return NextResponse.json({ error: 'Invalid invite code or signup details.' }, { status: 403 })
    }

    const cleanUsername = String(username).trim().toLowerCase().replace(/\s+/g, '_')
    if (!/^[a-z0-9_]{2,30}$/.test(cleanUsername)) {
      return NextResponse.json({ error: 'Username must be 2-30 letters, numbers, or underscores.' }, { status: 400 })
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: existing } = await admin.from('profiles').select('id').eq('username', cleanUsername).maybeSingle()
    if (existing) return NextResponse.json({ error: 'Username is already taken.' }, { status: 409 })

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error || !data.user) {
      return NextResponse.json({ error: error?.message || 'Could not create account.' }, { status: 400 })
    }

    const { error: profileError } = await admin.from('profiles').insert({
      id: data.user.id,
      username: cleanUsername,
      aura: 100,
      aura_all_time: 100,
      streak: 0,
      is_member: true,
    })

    if (profileError) {
      await admin.auth.admin.deleteUser(data.user.id)
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
}
