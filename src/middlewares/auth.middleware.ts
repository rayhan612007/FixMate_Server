import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { NextFunction, Request, Response } from 'express';

export interface AuthUser {
  id?: string;
  email: string;
  name?: string;
  role: 'customer' | 'technician' | 'admin';
}

// Augment Express Request with the decoded user
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * BetterAuth (Next.js) signs JWTs with a JWKS key pair.
 * We verify them remotely against BetterAuth's public JWKS endpoint.
 * Set BETTERAUTH_JWKS_URL to the frontend's <baseURL>/api/auth/jwks
 */
const JWKS_URL = process.env.BETTERAUTH_JWKS_URL ?? 'http://localhost:3000/api/auth/jwks';
const jwks = createRemoteJWKSet(new URL(JWKS_URL));

async function getUserFromToken(req: Request): Promise<AuthUser> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new HttpError(401, 'Unauthorized: missing or invalid token');
  }
  const token = header.slice(7);
  let payload: JWTPayload;
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
    role: role === 'technician' || role === 'admin' ? role : 'customer',
  };
}

/** Requires a valid JWT → 401 otherwise. Attaches req.user. */
export async function verifyToken(req: Request, _res: Response, next: NextFunction) {
  try {
    req.user = await getUserFromToken(req);
    next();
  } catch (err) {
    next(err);
  }
}

function requireRole(...roles: AuthUser['role'][]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = await getUserFromToken(req); // verify here too so role middlewares are standalone
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
