import { createRemoteJWKSet, jwtVerify } from 'jose';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * BetterAuth (running in Next.js) signs the JWTs, so we verify them against
 * its public JWKS endpoint instead of sharing a secret.
 * Set BETTERAUTH_JWKS_URL to <frontend>/api/auth/jwks.
 */
const JWKS_URL = process.env.BETTERAUTH_JWKS_URL;
const jwks = createRemoteJWKSet(new URL(JWKS_URL));

/** Reads and verifies the Bearer token, then returns the user we care about. */
async function getUserFromToken(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new HttpError(401, 'Unauthorized: missing or invalid token');
  }

  const token = header.slice(7);
  let payload;
  try {
    ({ payload } = await jwtVerify(token, jwks));
  } catch {
    throw new HttpError(401, 'Unauthorized: token expired or malformed');
  }

  if (!payload.email) {
    throw new HttpError(401, 'Unauthorized: invalid token payload');
  }

  const role = payload.role;
  return {
    id: typeof payload.sub === 'string' ? payload.sub : undefined,
    email: String(payload.email),
    name: typeof payload.name === 'string' ? payload.name : undefined,
    // Only technician/admin are trusted roles; everything else is a customer.
    role: role === 'technician' || role === 'admin' ? role : 'customer',
  };
}

/** Requires a valid JWT (401 otherwise) and attaches it as req.user. */
export async function verifyToken(req, _res, next) {
  try {
    req.user = await getUserFromToken(req);
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Verifies the token again so each role middleware also works on its own.
 * The verified user is always placed on req.user.
 */
function requireRole(...roles) {
  return async (req, _res, next) => {
    try {
      const user = req.user ?? await getUserFromToken(req);
      req.user = user;

      if (!roles.includes(user.role)) {
        throw new HttpError(403, `Forbidden: requires role ${roles.join(' or ')}`);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const verifyCustomer = requireRole('customer');
export const verifyTechnician = requireRole('technician');
export const verifyAdmin = requireRole('admin');

/** Route handlers call this after a verify* middleware guarantees req.user. */
export function getCurrentUser(req) {
  if (!req.user) throw new HttpError(401, 'Unauthorized');
  return req.user;
}
