import { z } from 'zod';

const schema = z.object({
  AI_PROVIDER_CALLS_ENABLED: z.enum(['true', 'false']).default('false'),
  EXTERNAL_DELIVERY_ENABLED: z.enum(['true', 'false']).default('false'),
  BILLING_AUTOMATIC_RECONCILIATION_ENABLED: z.enum(['true', 'false']).default('false'),
  CUSTOM_DOMAINS_ENABLED: z.enum(['true', 'false']).default('false'),
  PLATFORM_DATABASE_URL: z.string().url().optional(),
  PLATFORM_JWT_SECRET: z.string().min(32).optional(),
  PLATFORM_OPERATOR_ROLES: z.string().default('{}'),
  PLATFORM_ADMIN_USER_IDS: z.string().default(''),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(4000),
  APP_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().url(),
  DATABASE_ADMIN_URL: z.string().url().optional(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().default(900),
  REFRESH_TTL_DAYS: z.coerce.number().default(30),
  TRIAL_DAYS: z.coerce.number().default(14),
  PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 64 hex chars'),
  META_APP_ID: z.string().optional(),
  META_EMBEDDED_CONFIG_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_VERIFY_TOKEN: z.string().optional(),
  UPLOAD_DIR: z.string().default('./uploads'),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('claude-haiku-5-5'),
  EMBEDDING_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  EMBEDDING_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
