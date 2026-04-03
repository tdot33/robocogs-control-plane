import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_SESSION_COOKIE, createAdminSessionCookie, validateAdminCredentials } from '@/lib/admin-auth'

function safeNextPath(nextValue: string | null): string {
  if (!nextValue || !nextValue.startsWith('/admin')) {
    return '/admin/orchestration'
  }

  return nextValue
}

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const username = String(formData.get('username') || '')
  const password = String(formData.get('password') || '')
  const nextPath = safeNextPath(String(formData.get('next') || ''))

  if (!validateAdminCredentials(username, password)) {
    return NextResponse.redirect(new URL(`/admin/login?error=invalid&next=${encodeURIComponent(nextPath)}`, request.url))
  }

  const session = createAdminSessionCookie(username)
  if (!session) {
    return NextResponse.redirect(new URL('/admin/login?error=config', request.url))
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url))
  response.cookies.set(ADMIN_SESSION_COOKIE, session.value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: session.maxAge,
  })

  return response
}