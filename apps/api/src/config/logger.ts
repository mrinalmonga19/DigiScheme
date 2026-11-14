import pino from 'pino';
import { env } from './env';

/**
 * Redaction list: anything that could carry PII or secrets is censored before it reaches a log line.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-admin-passcode"]',
  'req.headers["x-twilio-signature"]',
  'req.body',
  'res.headers["set-cookie"]',
  '*.phone',
  '*.From',
  '*.WaId',
  '*.text',
  '*.message',
  '*.aadhaar',
  '*.otp',
  '*.token',
  '*.profile',
  '*.value',
];

export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
});
