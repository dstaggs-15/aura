import { NextResponse } from 'next/server'
import { requireUser, supabaseAdmin } from '@/lib/server'

export async function POST(request: Request) {
  try {
    const user = await requireUser(request)
    const sub = await request.json()
    const endpoint = sub?.endpoint
    const p256dh = sub?.keys?.p256dh
    const auth = sub?.keys?.auth
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: 'Invalid subscription.' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.from('push_subscriptions').upsert({
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' })

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unable to subscribe.' }, { status: err?.message === 'Unauthorized' ? 401 : 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser(request)
    const { endpoint } = await request.json()
    if (endpoint) {
      await supabaseAdmin.from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', endpoint)
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
