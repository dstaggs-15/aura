import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')!
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')!
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com'

    if (!vapidPublic || !vapidPrivate) throw new Error('VAPID secrets are not configured')

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const admin = createClient(supabaseUrl, serviceKey)

    const { data: { user }, error: userError } = await caller.auth.getUser()
    if (userError || !user) return new Response('Unauthorized', { status: 401, headers: cors })

    const { post_id } = await req.json()
    const { data: post } = await admin.from('posts')
      .select('id,user_id,text,profiles!inner(username,is_member)')
      .eq('id', post_id)
      .single()

    if (!post || post.user_id !== user.id || !post.profiles?.is_member) {
      return new Response('Forbidden', { status: 403, headers: cors })
    }

    const { data: recipients } = await admin.from('profiles')
      .select('id')
      .eq('is_member', true)
      .eq('notify_new_posts', true)
      .neq('id', user.id)

    const recipientIds = (recipients || []).map(r => r.id)
    if (!recipientIds.length) return Response.json({ ok: true, sent: 0 }, { headers: cors })

    const { data: alreadySent } = await admin.from('notifications')
      .select('id')
      .eq('type', 'new_post')
      .eq('post_id', post.id)
      .limit(1)

    if (alreadySent?.length) {
      return Response.json({ ok: true, sent: 0, duplicate: true }, { headers: cors })
    }

    const message = `${post.profiles.username} posted: ${String(post.text).slice(0, 110)}`
    await admin.from('notifications').upsert(
      recipientIds.map(id => ({
        user_id: id,
        actor_id: user.id,
        type: 'new_post',
        post_id: post.id,
        message,
      })),
      { onConflict: 'user_id,type,post_id,actor_id', ignoreDuplicates: true },
    )

    const { data: subscriptions } = await admin.from('push_subscriptions')
      .select('id,user_id,endpoint,p256dh,auth')
      .in('user_id', recipientIds)

    let sent = 0
    await Promise.all((subscriptions || []).map(async sub => {
      try {
        webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title: `🔥 ${post.profiles.username} posted`,
            body: String(post.text).slice(0, 140),
            url: '/',
            tag: `post-${post.id}`,
          }),
          { TTL: 3600, urgency: 'high' },
        )
        sent++
      } catch (err) {
        const status = Number((err as any)?.statusCode || 0)
        if (status === 404 || status === 410) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id)
        }
      }
    }))

    return Response.json({ ok: true, sent }, { headers: cors })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Push failed' }, { status: 500, headers: cors })
  }
})
