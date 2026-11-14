import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env';

const common = {
  standardHeaders: 'draft-7' as const,
  legacyHeaders: false,
  skip: () => env.isTest,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a minute and try again.' } },
};

export const apiLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 240 });
/** The chat endpoints call paid/slow services, so they get a tighter budget. */
export const chatLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 40 });
export const authLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 30 });
export const linkLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 30 });
