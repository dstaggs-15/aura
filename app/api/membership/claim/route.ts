import { NextResponse } from 'next/server'
import { getSupabaseAdmin, requireUser } from '@/lib/server'

export async function POST(request: Request) {
  try {
    const user = await requireUser(request)
    const { error } = await getSupabaseAdmin()
      .from('private_members')
      .upsert({ user_id: user.id }, { onConflict: 'user_id' })
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unable to activate membership.' }, { status: err?.message === 'Unauthorized' ? 401 : 500 })
  }
}
