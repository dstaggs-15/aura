# Aura deployment checklist

This branch moves Aura's economy to database RPCs, adds invite-only signup, friends, browser push notifications, realtime refreshes, weekly settlement, and stricter RLS.

## 1. Apply the database migration

Apply:

`supabase/migrations/20260922193000_harden_aura.sql`

This migration:

- marks existing profiles as members
- adds invite/member flags
- adds friends, notification, push subscription, vote event, and weekly round tables
- moves aura changes into atomic PostgreSQL functions
- fixes vote-cost deltas and tagged-user bonus inflation
- enforces anti-glazing
- adds clown tax tiers and recovery check-ins
- schedules inactivity penalties and weekly prize settlement when pg_cron is available
- locks data down with member-only RLS

Do not deploy the frontend before the migration is applied because the frontend calls the new RPC functions.

## 2. Configure Vercel environment variables

Copy the names from `.env.example`.

Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AURA_INVITE_CODE`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`

`SUPABASE_SERVICE_ROLE_KEY` and `AURA_INVITE_CODE` must remain server-only.

## 3. Generate VAPID keys

Generate one Web Push VAPID key pair. Put the public key in Vercel as `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.

Configure these Supabase Edge Function secrets:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

The public key must match the Vercel public key.

## 4. Deploy the Edge Function

Deploy:

`supabase/functions/send-new-post-push`

The function verifies that the caller owns the post, creates notification records once, sends Web Push to every other member who opted in, and removes dead browser subscriptions.

## 5. Realtime

For live feed/friend/profile refreshes, make sure Realtime replication is enabled for:

- `posts`
- `profiles`
- `comments`
- `friendships`

The app still works without Realtime, but other users' changes will not appear instantly.

## 6. Private access model

Aura is now invite-only:

- public self-signup was removed
- new users need `AURA_INVITE_CODE`
- new profiles are created server-side with `is_member=true`
- RLS blocks anonymous reads
- authenticated accounts without an Aura member profile are signed out
- robots metadata and `robots.txt` prevent normal search indexing

The login page can still be reached by someone who knows the URL, but they cannot read Aura data without an authorized account.

## 7. Push support

Users enable notifications from their Profile page. Browser push works on supported desktop browsers and mobile browsers/PWAs that implement Web Push. Permission must be granted by the user.

## 8. Economy changes

Positive vote costs are now:

| Vote | Cost |
| --- | ---: |
| +1 | 1 |
| +5 | 2 |
| +10 | 5 |
| +50 | 20 |

Changing a vote only charges/refunds the cost difference. Negative votes remain free.

Tagged users split one 50% bonus pool rather than each receiving 50%.

Clown tax tiers:

- below 0: 25%
- at or below -100: 35%
- at or below -500: 50%

Negative users receive +7 for a daily check-in instead of +5.

The current weekly top post now only considers posts from the current week. The scheduled settlement pays the pool and resets it.
