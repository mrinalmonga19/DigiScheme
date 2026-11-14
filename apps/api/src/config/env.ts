import 'dotenv/config';
import crypto from 'node:crypto';
import { z } from 'zod';

/**
 * All configuration comes from environment variables and is validated once at boot.
 * Every adapter has a mode flag and every mode has a mock, so the app runs with no
 * credentials at all (see .env.example).
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  PUBLIC_BASE_URL: z.string().default('http://localhost:4000'),
  WEB_BASE_URL: z.string().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:4173'),
  SERVE_WEB: z.enum(['true', 'false']).default('false'),

  DB_MODE: z.enum(['mongo', 'memory']).optional(),
  MONGO_URI: z.string().optional(),

  JWT_SECRET: z.string().min(16).optional(),
  FIELD_ENCRYPTION_KEY: z.string().optional(), // 64 hex chars (32 bytes)
  PHONE_HASH_SALT: z.string().optional(),
  ADMIN_PASSCODE: z.string().optional(),

  LLM_MODE: z.enum(['gemini', 'mock']).default('mock'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),

  BHASHINI_MODE: z.enum(['live', 'fallback']).default('fallback'),
  BHASHINI_USER_ID: z.string().optional(),
  BHASHINI_API_KEY: z.string().optional(),
  BHASHINI_PIPELINE_ID: z.string().optional(),
  BHASHINI_CONFIG_URL: z
    .string()
    .default('https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline'),

  DIGILOCKER_MODE: z.enum(['mock', 'live']).default('mock'),
  DIGILOCKER_CLIENT_ID: z.string().optional(),
  DIGILOCKER_CLIENT_SECRET: z.string().optional(),
  DIGILOCKER_REDIRECT_URI: z.string().optional(),
  DIGILOCKER_BASE_URL: z.string().optional(),

  AADHAAR_MODE: z.enum(['mock', 'live']).default('mock'),
  AADHAAR_KUA_ENDPOINT: z.string().optional(),

  WHATSAPP_MODE: z.enum(['twilio', 'mock']).default('mock'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_FROM: z.string().default('whatsapp:+14155238886'),

  GRIEVANCE_CONTACT: z.string().default('grievance@digischeme.example (prototype contact)'),
  LOG_LEVEL: z.string().default('info'),
});

const parsed = schema.parse(process.env);
const isProd = parsed.NODE_ENV === 'production';

/** In production every secret must be set explicitly; in dev/test we generate throwaway ones. */
function secret(name: string, value: string | undefined, generate: () => string): string {
  if (value) return value;
  if (isProd) throw new Error(`${name} must be set in production`);
  return generate();
}

export const env = {
  ...parsed,
  isProd,
  isTest: parsed.NODE_ENV === 'test',
  DB_MODE: parsed.DB_MODE ?? (parsed.MONGO_URI ? 'mongo' : 'memory'),
  JWT_SECRET: secret('JWT_SECRET', parsed.JWT_SECRET, () => crypto.randomBytes(32).toString('hex')),
  FIELD_ENCRYPTION_KEY: secret('FIELD_ENCRYPTION_KEY', parsed.FIELD_ENCRYPTION_KEY, () =>
    crypto.createHash('sha256').update('digischeme-dev-key').digest('hex'),
  ),
  PHONE_HASH_SALT: secret('PHONE_HASH_SALT', parsed.PHONE_HASH_SALT, () => 'digischeme-dev-salt'),
  ADMIN_PASSCODE: secret('ADMIN_PASSCODE', parsed.ADMIN_PASSCODE, () => 'demo-admin'),
  // The mock WhatsApp channel still validates signatures, against this well-known test token.
  TWILIO_AUTH_TOKEN: parsed.TWILIO_AUTH_TOKEN ?? (parsed.WHATSAPP_MODE === 'mock' ? 'mock-twilio-token' : undefined),
  corsOrigins: parsed.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
};

export type Env = typeof env;

/** Which parts of the product are simulated right now. Drives the "Demo mode" badge. */
export function demoFlags() {
  const llm = env.LLM_MODE === 'mock' || !env.GEMINI_API_KEY;
  const digilocker = env.DIGILOCKER_MODE === 'mock';
  const aadhaar = env.AADHAAR_MODE === 'mock';
  const language = env.BHASHINI_MODE !== 'live' || !env.BHASHINI_API_KEY;
  return { llm, digilocker, aadhaar, language, any: llm || digilocker || aadhaar || language };
}
