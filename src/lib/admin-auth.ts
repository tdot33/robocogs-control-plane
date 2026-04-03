import crypto from 'crypto'

export const ADMIN_SESSION_COOKIE = 'rc_admin_session'

const SESSION_TTL_SECONDS = 60 * 60 * 12

function timingSafeEqualText(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)

  if (aBuf.length !== bBuf.length) {
    return false
  }

  return crypto.timingSafeEqual(aBuf, bBuf)
}

function getSecret(): string | null {
  return process.env.ADMIN_UI_SESSION_SECRET || null
}

function sign(value: string): string | null {
  const secret = getSecret()
  if (!secret) {
    return null
  }

  return crypto.createHmac('sha256', secret).update(value).digest('hex')
}

export function validateAdminCredentials(username: string, password: string): boolean {
  const expectedUsername = process.env.ADMIN_UI_USERNAME
  const expectedPassword = process.env.ADMIN_UI_PASSWORD

  if (!expectedUsername || !expectedPassword) {
    return false
  }

  return timingSafeEqualText(username, expectedUsername) && timingSafeEqualText(password, expectedPassword)
}

export function createAdminSessionCookie(username: string): { value: string; maxAge: number } | null {
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + SESSION_TTL_SECONDS
  const nonce = crypto.randomBytes(12).toString('hex')
  const payload = `${username}:${expiresAt}:${nonce}`
  const signature = sign(payload)

  if (!signature) {
    return null
  }

  return {
    value: `${payload}.${signature}`,
    maxAge: SESSION_TTL_SECONDS,
  }
}

export function isAdminSessionValid(cookieValue: string | undefined): boolean {
  if (!cookieValue) {
    return false
  }

  const splitAt = cookieValue.lastIndexOf('.')
  if (splitAt <= 0) {
    return false
  }

  const payload = cookieValue.slice(0, splitAt)
  const signature = cookieValue.slice(splitAt + 1)
  const expected = sign(payload)

  if (!expected || !timingSafeEqualText(signature, expected)) {
    return false
  }

  const payloadParts = payload.split(':')
  if (payloadParts.length !== 3) {
    return false
  }

  const expiresAt = Number(payloadParts[1])
  if (!Number.isFinite(expiresAt)) {
    return false
  }

  const now = Math.floor(Date.now() / 1000)
  return now < expiresAt
}