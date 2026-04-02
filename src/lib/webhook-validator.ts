import crypto from 'crypto'

/**
 * Validates a GitHub webhook signature using HMAC-SHA256
 * Implements timing-safe comparison and replay protection
 */
export function validateWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  replayWindowSeconds: number = 300 // 5 minutes
): boolean {
  // Extract algorithm and hash from signature (format: sha256=xxx)
  const [algorithm, hash] = signature.split('=')
  
  if (algorithm !== 'sha256') {
    return false
  }

  // Compute HMAC-SHA256
  const computed = crypto.createHmac('sha256', secret).update(payload).digest('hex')

  // Timing-safe comparison to prevent timing attacks
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(computed))
}

/**
 * Extracts and validates the replay protection timestamp from webhook headers
 */
export function validateReplayProtection(
  timestamp: string,
  signature: string,
  replayWindowSeconds: number = 300
): boolean {
  try {
    const ts = parseInt(timestamp, 10)
    const now = Math.floor(Date.now() / 1000)
    const diff = Math.abs(now - ts)

    // Check if timestamp is within acceptable window
    return diff <= replayWindowSeconds
  } catch {
    return false
  }
}

/**
 * Validates a complete webhook request: signature + replay protection
 */
export function validateWebhookRequest(
  payload: string,
  xHubSignature256: string,
  xWebhookTimestamp: string,
  secret: string
): boolean {
  // Validate signature
  if (!validateWebhookSignature(payload, xHubSignature256, secret)) {
    return false
  }

  // Validate replay protection
  if (!validateReplayProtection(xWebhookTimestamp, xHubSignature256)) {
    return false
  }

  return true
}
