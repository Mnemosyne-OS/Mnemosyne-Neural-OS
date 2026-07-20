/**
 * @mnemosyne/sdk — JWT HMAC-SHA256 Auth
 *
 * Generates and validates authentication tokens for SDK apps.
 * Uses `node:crypto` — zero external dependencies.
 *
 * Format: base64url(header).base64url(payload).base64url(signature)
 * Algorithm: HMAC-SHA256 (symmetric, shared secret OS ↔ app)
 *
 * ## Browser Compat (MN-005)
 * `Buffer.toString('base64url')` is not supported by the npm `buffer` polyfill.
 * The b64url() / parseB64url() helpers use a universal impl:
 *   - Node.js  : native Buffer (supports base64url)
 *   - Browser  : btoa/atob + replacement of non-URL characters
 * This allows importing the SDK CONSTANTS in an Electron renderer without a crash.
 *
 * [SDK][SECURITY][AUTH][MN-005]
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string;        // appId
  iat: number;        // issued at (unix timestamp)
  exp: number;        // expiry (unix timestamp)
  scopes: string[];   // authorized scopes
  jti: string;        // JWT ID unique (anti-replay)
}

export interface JwtVerifyResult {
  valid: boolean;
  payload?: JwtPayload;
  reason?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Universal base64url helpers (Node + Browser) ──────────────────────────

/**
 * Encodes a string or a Buffer to base64url.
 * Node.js  : Buffer.from().toString('base64url') — native
 * Browser  : btoa() + non-URL char replacement (RFC 4648 §5)
 */
function b64url(input: string | Uint8Array): string {
  if (typeof Buffer !== 'undefined' && typeof (Buffer.alloc(0).toString as any)('base64url') === 'string') {
    // Test whether base64url is supported (native Node.js)
    try {
      const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input);
      return buf.toString('base64url');
    } catch { /* fallback */ }
  }
  // Universal fallback (Browser / polyfill without base64url)
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : input;
  let b64 = '';
  if (typeof btoa !== 'undefined') {
    b64 = btoa(String.fromCharCode(...Array.from(bytes)));
  } else {
    b64 = Buffer.from(bytes).toString('base64');
  }
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decodes a base64url string to a UTF-8 string.
 * Node.js  : Buffer.from(input, 'base64url').toString('utf8') — native
 * Browser  : char replacement + atob()
 */
function parseB64url(input: string): string {
  // Normalize base64url → standard base64
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - input.length % 4) % 4);
  if (typeof atob !== 'undefined') {
    return decodeURIComponent(escape(atob(base64)));
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

const HEADER = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

// ── Core functions ────────────────────────────────────────────────────────────

/**
 * Signs a payload and returns the complete JWT token.
 */
export function signToken(payload: JwtPayload, secret: string): string {
  const payloadB64 = b64url(JSON.stringify(payload));
  const data       = `${HEADER}.${payloadB64}`;
  const sig        = createHmac('sha256', secret).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

/**
 * Verifies a JWT token.
 * Uses `timingSafeEqual` to avoid timing attacks.
 */
export function verifyToken(token: string, secret: string): JwtVerifyResult {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, reason: 'MALFORMED_TOKEN' };
  }

  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];
  const data        = `${headerB64}.${payloadB64}`;
  const expectedSig = createHmac('sha256', secret).update(data).digest();
  const actualSig   = Buffer.from(sigB64, 'base64url');

  // Timing-safe comparison — same length required
  if (
    expectedSig.length !== actualSig.length ||
    !timingSafeEqual(expectedSig, actualSig)
  ) {
    return { valid: false, reason: 'INVALID_SIGNATURE' };
  }

  let payload: JwtPayload;
  try {
    payload = JSON.parse(parseB64url(payloadB64)) as JwtPayload;
  } catch {
    return { valid: false, reason: 'MALFORMED_PAYLOAD' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    return { valid: false, reason: 'TOKEN_EXPIRED' };
  }

  return { valid: true, payload };
}

/**
 * Generates a token for an SDK app.
 * @param appId    App identifier
 * @param scopes   Authorized scopes
 * @param secret   HMAC secret (32 bytes minimum)
 * @param ttlMs    Time-to-live in ms (default: 24h)
 */
export function generateAppToken(
  appId: string,
  scopes: string[],
  secret: string,
  ttlMs: number = 24 * 60 * 60 * 1000,
): { token: string; expiresAt: number } {
  const iat = Math.floor(Date.now() / 1000);
  const exp = Math.floor((Date.now() + ttlMs) / 1000);

  const payload: JwtPayload = {
    sub:    appId,
    iat,
    exp,
    scopes,
    jti:    randomBytes(16).toString('hex'),
  };

  return {
    token:     signToken(payload, secret),
    expiresAt: exp * 1000,
  };
}

/**
 * Generates a random HMAC secret (to store in the OS keychain).
 */
export function generateSecret(): string {
  return randomBytes(32).toString('hex');
}
