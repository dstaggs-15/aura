import webpush from 'web-push'
import { getSupabaseAdmin } from '@/lib/server'

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const privateKey = process.env.VAPID_PRIVATE_KEY
const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com'

if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey)
}

export type PushPayload = {
  title: string
  body: string
  url?: string
  tag?: string
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  if (!publicKey || !privateKey || userIds.length === 0) return { sent: 0, failed: 0 }

  const { data: subscriptions, error } = await getSupabaseAdmin()
    .from('push_subscriptions')
    .select('id,user_id,endpoint,p256dh,auth')
    .in('user_id', userIds)

  if (error) throw error

  let sent = 0
  let failed = 0
  await Promise.all((subscriptions || []).map(async sub => {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }, JSON.stringify(payload), { TTL: 60 * 60 })
      sent++
    } catch (err: any) {
      failed++
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await getSupabaseAdmin().from('push_subscriptions').delete().eq('id', sub.id)
      }
    }
  }))

  return { sent, failed }
}
