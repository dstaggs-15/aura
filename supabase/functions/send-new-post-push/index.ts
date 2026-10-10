import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VAPID_PUBLIC = 'BEbse352LwkSuMmgi3olJXrLjjVlbiCVU7JdSiBcJJBwRhaVGWFOf1IyscziCFBky_rQudsQlUrCzHs-PLy1cJM'
const VAPID_PRIVATE = '_j_Kl4btMz3zGmgXW20KAAgRWwjVVE1sI4bfZwynQk0'
const VAPID_SUBJECT = 'mailto:aura-admin@example.com'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const admin = createClient(supabaseUrl, serviceKey)

    const { data: { user }, error: userError } = await caller.auth.getUser()
    if (userError || !user) return new Response('Unauthorized', { status: 401, headers: cors })

    const { post_id, announcement, reply_comment_id } = await req.json()

    if (announcement) {
      if (user.id !== '47001ee1-c4b8-4661-9657-016e9e6299ff') {
        return new Response('Forbidden', { status: 403, headers: cors })
      }

      const message = String(announcement).trim().slice(0, 220)
      if (!message) return new Response('Message required', { status: 400, headers: cors })

      const { data: recipients } = await admin.from('profiles')
        .select('id')
        .eq('is_member', true)

      const recipientIds = (recipients || []).map(r => r.id)
      const { data: subscriptions } = recipientIds.length
        ? await admin.from('push_subscriptions')
            .select('id,user_id,endpoint,p256dh,auth')
            .in('user_id', recipientIds)
        : { data: [] }

      webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

      let sent = 0
      await Promise.all((subscriptions || []).map(async sub => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({
              title: '🔥 Aura announcement',
              body: message,
              url: '/',
              tag: 'aura-announcement-' + Date.now(),
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
    }
    if (reply_comment_id) {
      const { data: reply } = await admin.from('comments')
        .select('id,user_id,text,post_id,parent_comment_id')
        .eq('id', reply_comment_id)
        .single()

      if (!reply || reply.user_id !== user.id || !reply.parent_comment_id) {
        return new Response('Forbidden', { status: 403, headers: cors })
      }

      const { data: parent } = await admin.from('comments')
        .select('id,user_id,text')
        .eq('id', reply.parent_comment_id)
        .single()

      if (!parent) return new Response('Parent comment not found', { status: 404, headers: cors })

      const { data: actor } = await admin.from('profiles')
        .select('username,is_member')
        .eq('id', user.id)
        .single()

      if (!actor?.is_member) return new Response('Forbidden', { status: 403, headers: cors })

      const recipientId = parent.user_id
      if (recipientId === user.id) return Response.json({ ok: true, sent: 0 }, { headers: cors })

      await admin.from('notifications').insert({
        user_id: recipientId,
        actor_id: user.id,
        type: 'comment_reply',
        post_id: reply.post_id,
        message: `${actor.username} replied to your comment: ${String(reply.text).slice(0, 110)}`,
      })

      const { data: subscriptions } = await admin.from('push_subscriptions')
        .select('id,user_id,endpoint,p256dh,auth')
        .eq('user_id', recipientId)

      webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
      let sent = 0
      await Promise.all((subscriptions || []).map(async sub => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({
              title: `💬 ${actor.username} replied to you`,
              body: String(reply.text).slice(0, 140),
              url: '/',
              tag: `reply-${reply.id}`,
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
    }

    const { data: post } = await admin.from('posts')
      .select('id,user_id,text,profiles!posts_user_id_fkey(username,is_member)')
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

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

    let sent = 0
    await Promise.all((subscriptions || []).map(async sub => {
      try {
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