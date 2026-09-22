import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const code = typeof body?.code === 'string' ? body.code : ''
  const expected = process.env.AURA_ACCESS_CODE
  const token = process.env.AURA_ACCESS_TOKEN

  if (!expected || !token) {
    return NextResponse.json({ error: 'Private access is not configured.' }, { status: 503 })
  }
  if (code !== expected) {
    return NextResponse.json({ error: 'Invalid access code.' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set('aura_private_access', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
  })
  return response
}
