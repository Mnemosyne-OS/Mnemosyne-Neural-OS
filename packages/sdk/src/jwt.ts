/**
 * @mnemosyne/sdk — JWT HMAC-SHA256 Auth
 *
 * Génère et valide des tokens d'authentification pour les apps SDK.
 * Utilise `node:crypto` — zéro dépendance externe.
 *
 * Format : base64url(header).base64url(payload).base64url(signature)
 * Algorithme : HMAC-SHA256 (symétrique, secret partagé OS ↔ app)
 *
 * ## Compat Browser (MN-005)
 * `Buffer.toString('base64url')` n'est pas supporté par le polyfill npm `buffer`.
 * Les helpers b64url() / parseB64url() utilisent une impl universelle :
 *   - Node.js  : Buffer natif (supporte base64url)
 *   - Browser  : btoa/atob + remplacement des caractères non-URL
 * Cela permet d'importer les CONSTANTES du SDK dans un renderer Electron sans crash.
 *
 * [SDK][SECURITY][AUTH][MN-005]
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string;        // appId
  iat: number;        // issued at (unix timestamp)
  exp: number;        // expiry (unix timestamp)
  scopes: string[];   // scopes autorisés
  jti: string;        // JWT ID unique (anti-replay)
}

export interface JwtVerifyResult {
  valid: boolean;
  payload?: JwtPayload;
  reason?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Helpers universels base64url (Node + Browser) ─────────────────────────

/**
 * Encode une string ou un Buffer en base64url.
 * Node.js  : Buffer.from().toString('base64url') — natif
 * Browser  : btoa() + remplacement char non-URL (RFC 4648 §5)
 */
function b64url(input: string | Uint8Array): string {
  if (typeof Buffer !== 'undefined' && typeof (Buffer.alloc(0).toString as any)('base64url') === 'string') {
    // Test si base64url est supporté (Node.js natif)
    try {
      const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input);
      return buf.toString('base64url');
    } catch { /* fallback */ }
  }
  // Fallback universel (Browser / polyfill sans base64url)
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
 * Décode une string base64url en string UTF-8.
 * Node.js  : Buffer.from(input, 'base64url').toString('utf8') — natif
 * Browser  : remplacement char + atob()
 */
function parseB64url(input: string): string {
  // Normalise base64url → base64 standard
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
 * Signe un payload et retourne le token JWT complet.
 */
export function signToken(payload: JwtPayload, secret: string): string {
  const payloadB64 = b64url(JSON.stringify(payload));
  const data       = `${HEADER}.${payloadB64}`;
  const sig        = createHmac('sha256', secret).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

/**
 * Vérifie un token JWT.
 * Utilise `timingSafeEqual` pour éviter les timing attacks.
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

  // Timing-safe comparison — même longueur requise
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
 * Génère un token pour une app SDK.
 * @param appId    Identifiant de l'app
 * @param scopes   Scopes autorisés
 * @param secret   Secret HMAC (32 bytes minimum)
 * @param ttlMs    Durée de vie en ms (défaut: 24h)
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
 * Génère un secret HMAC aléatoire (à stocker dans le keychain OS).
 */
export function generateSecret(): string {
  return randomBytes(32).toString('hex');
}
