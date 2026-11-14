import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger';
import { ApplicationError } from '../services/applications';
import { ConsentError } from '../services/verification';

/** An error the client is allowed to see. Shape on the wire: `{ error: { code, message } }`. */
export class HttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

export const notFound: RequestHandler = (_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'Not found'));

const CONSENT_STATUS: Record<string, number> = {
  BAD_STATE: 400, NOT_FOUND: 404, NOT_PENDING: 409, INVALID_DEMO_CODE: 400, NO_CONSENT: 403, EXPIRED: 410,
};
const APP_STATUS: Record<string, number> = { UNKNOWN_SCHEME: 404, NO_GUIDE: 404, NOT_FOUND: 404 };

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let status = 500;
  let code = 'INTERNAL';
  let message = 'Something went wrong on our side. Please try again.';
  if (err instanceof HttpError) ({ status, code, message } = err);
  else if (err instanceof ZodError) {
    status = 400; code = 'VALIDATION';
    message = err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
  } else if (err instanceof ConsentError) {
    ({ code, message } = err);
    status = CONSENT_STATUS[err.code] ?? 400;
  } else if (err instanceof ApplicationError) {
    ({ code, message } = err);
    status = APP_STATUS[err.code] ?? 400;
  } else if ((err as { type?: string }).type === 'entity.too.large') { status = 413; code = 'TOO_LARGE'; message = 'That request is too large.'; }
  else if ((err as { type?: string }).type === 'entity.parse.failed') { status = 400; code = 'BAD_JSON'; message = 'The request body is not valid JSON.'; }
  else if ((err as { code?: string }).code === 'LIMIT_FILE_SIZE') { status = 413; code = 'TOO_LARGE'; message = 'That file is too large.'; }
  if (status >= 500) logger.error({ err: (err as Error).message, stack: (err as Error).stack, path: req.path }, 'unhandled error');
  res.status(status).json({ error: { code, message } });
};

/** Express 5 forwards rejected promises, but keeping this makes handlers read the same everywhere. */
export const wrap = (fn: (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res).catch(next); };
