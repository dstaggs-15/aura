import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let adminClient: SupabaseClient | null = null

export function getSupabaseAdmin() {
  if (adminClient) return adminClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !secret) throw new Error('Missing Supabase server environment variables')

  adminClient = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return adminClient
}

export async function requireUser(request: Request) {
  const auth = request.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) throw new Error('Unauthorized')

  const { data, error } = await getSupabaseAdmin().auth.getUser(token)
  if (error || !data.user) throw new Error('Unauthorized')
  return data.user
}
