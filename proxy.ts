import { NextRequest, NextResponse } from 'next/server'

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    pathname === '/enter' ||
    pathname === '/api/access' ||
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    pathname.startsWith('/icon-') ||
    pathname.startsWith('/_next/')
  ) {
    return NextResponse.next()
  }

  const expected = process.env.AURA_ACCESS_TOKEN
  const granted = request.cookies.get('aura_private_access')?.value

  if (!expected || granted !== expected) {
    const url = request.nextUrl.clone()
    url.pathname = '/enter'
    url.search = ''
    return NextResponse.redirect(url)
  }

  const response = NextResponse.next()
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
  return response
}

export const config = {
  matcher: ['/((?!favicon.ico).*)'],
}
