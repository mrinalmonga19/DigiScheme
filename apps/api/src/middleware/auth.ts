import type { Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { AppContext } from '../context';
import type { UserDoc } from '../db/store';
import { timingSafeEqual } from '../services/crypto';
import { HttpError } from './errors';

export const COOKIE = 'ds_session';
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;

declare module 'express-serve-static-core' {
  interface Request {
    user?: UserDoc;
  }
}

export function issueSession(res: Response, userId: string): string {
  const token = jwt.sign({ uid: userId }, env.JWT_SECRET, { expiresIn: '30d', audience: 'session' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: env.isProd, maxAge: MAX_AGE_MS, path: '/' });
  return token;
}

export const clearSession = (res: Response): void => { res.clearCookie(COOKIE, { path: '/' }); };

function tokenFrom(req: Request): string | null {
  const bearer = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  return (req.cookies?.[COOKIE] as string | undefined) ?? bearer ?? null;
}

export function userIdFromToken(token: string): string | null {
  try {
    return (jwt.verify(token, env.JWT_SECRET, { audience: 'session' }) as { uid: string }).uid;
  } catch {
    return null;
  }
}

/** Loads req.user when a valid session exists; never fails. */
export const attachUser = (app: AppContext): RequestHandler => async (req, _res, next) => {
  try {
    const token = tokenFrom(req);
    const uid = token ? userIdFromToken(token) : null;
    if (uid) req.user = (await app.store.users.findOne({ _id: uid })) ?? undefined;
    next();
  } catch (err) { next(err); }
};

export const requireUser: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, 'NO_SESSION', 'Please start a session first.'));
  next();
};

/** Chat and profile storage need the user's agreement to the privacy notice (spec 6, DPDP-aligned). */
export const requireConsent: RequestHandler = (req, _res, next) => {
  if (!req.user?.consentFlags.dataProcessing.granted) {
    return next(new HttpError(403, 'CONSENT_REQUIRED', 'Please agree to the privacy notice to continue.'));
  }
  next();
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  const pass = String(req.headers['x-admin-passcode'] ?? '');
  if (!pass || !timingSafeEqual(pass, env.ADMIN_PASSCODE)) return next(new HttpError(401, 'ADMIN_ONLY', 'Admin passcode required.'));
  next();
};

export const user = (req: Request): UserDoc => {
  if (!req.user) throw new HttpError(401, 'NO_SESSION', 'Please start a session first.');
  return req.user;
};
