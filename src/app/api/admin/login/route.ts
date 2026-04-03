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
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost'
    const proto = request.headers.get('x-forwarded-proto') || 'https'
    const base = `${proto}://${host}`
    return NextResponse.redirect(new URL(`/admin/login?error=invalid&next=${encodeURIComponent(nextPath)}`, base))
  }

  const session = createAdminSessionCookie(username)
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost'
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  const base = `${proto}://${host}`
  if (!session) {
    return NextResponse.redirect(new URL('/admin/login?error=config', base))
  }

  const response = NextResponse.redirect(new URL(nextPath, base))
  response.cookies.set(ADMIN_SESSION_COOKIE, session.value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: session.maxAge,
  })

  return response
}