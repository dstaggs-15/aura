# Aura deployment notes

Aura is now configured so the production app does not require manual invite-code, service-role, or VAPID environment-variable setup in Vercel.

## Supabase

Already applied to the Aura project:

- secure economy/ledger migration
- friends and notification tables
- anti-glazing event history
- clown tiers and recovery check-ins
- weekly settlement and inactivity jobs
- member-only RLS
- Realtime replication for posts, profiles, comments, and friendships
- invite membership claim RPC
- `send-new-post-push` Edge Function

Keep the tracked migrations in `supabase/migrations` as the schema history.

## Vercel

The app only needs the existing Supabase public environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

No private service-role key is required by the Next.js app.

## Invite-only access

Public users may reach the login screen, but Aura data is protected by RLS. A new authenticated account cannot read or use Aura until the membership-claim RPC accepts the private invite code and creates an approved profile.

Existing Aura profiles remain approved members.

## Browser push

Users opt in from their Profile page. The service worker stores a Web Push subscription in Supabase. When a member creates a post, the deployed Edge Function fans that post out to all other members who opted into new-post notifications.

The browser still requires the user to grant notification permission. Mobile support depends on the browser/PWA's Web Push support.

## Economy

Positive vote costs:

| Vote | Cost |
| --- | ---: |
| +1 | 1 |
| +5 | 2 |
| +10 | 5 |
| +50 | 20 |

Changing a vote charges or refunds only the difference in vote cost.

Tagged users split a single 50% bonus pool.

Clown-mode positive-gain tax:

- below 0: 25%
- at or below -100: 35%
- at or below -500: 50%

Negative users receive +7 aura for daily check-in instead of +5.

The weekly leaderboard only considers the current week and the scheduled settlement pays and resets the prize pool.
