import { NextResponse } from 'next/server'
import { requireUser, supabaseAdmin } from '@/lib/server'
import { sendPushToUsers } from '@/lib/push'

export async function POST(request: Request) {
  try {
    const user = await requireUser(request)
    const { postId } = await request.json()
    if (!Number.isFinite(Number(postId))) {
      return NextResponse.json({ error: 'Invalid post.' }, { status: 400 })
    }

    const { data: post, error: postError } = await supabaseAdmin
      .from('posts')
      .select('id,user_id,text,profiles(username)')
      .eq('id', Number(postId))
      .single()

    if (postError || !post || post.user_id !== user.id) {
      return NextResponse.json({ error: 'Post not found.' }, { status: 404 })
    }

    const eventKey = `post:${post.id}`
    const { error: eventError } = await supabaseAdmin
      .from('notification_events')
      .insert({ event_key: eventKey })

    if (eventError) {
      if ((eventError as any).code === '23505') return NextResponse.json({ ok: true, duplicate: true })
      throw eventError
    }

    const { data: users } = await supabaseAdmin.from('profiles').select('id').neq('id', user.id)
    const recipients = (users || []).map(u => u.id)
    const username = (post as any).profiles?.username || 'Someone'
    const preview = String(post.text || '').trim().slice(0, 90)

    if (recipients.length) {
      await supabaseAdmin.from('notifications').insert(recipients.map(userId => ({
        user_id: userId,
        actor_id: user.id,
        type: 'new_post',
        post_id: post.id,
        message: `${username} posted${preview ? `: ${preview}` : ''}`,
      })))
    }

    const result = await sendPushToUsers(recipients, {
      title: `🔥 ${username} posted`,
      body: preview || 'Open Aura to see the new post.',
      url: '/',
      tag: eventKey,
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Push failed.' }, { status: err?.message === 'Unauthorized' ? 401 : 500 })
  }
}
