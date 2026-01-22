import Joi from 'joi';

export const validationSchema = Joi.object({
  // Application
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'staging')
    .default('development'),
  PORT: Joi.number().default(3000),
  API_URL: Joi.string().uri().optional(),
  DASHBOARD_URL: Joi.string().uri().optional(),

  // Database
  DATABASE_URL: Joi.string().required(),

  // Redis
  REDIS_URL: Joi.string().optional(),

  // JWT
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRATION: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRATION: Joi.string().default('7d'),

  // Evolution API
  EVOLUTION_API_URL: Joi.string().uri().optional(),
  EVOLUTION_API_KEY: Joi.string().optional(),
  EVOLUTION_WEBHOOK_URL: Joi.string().uri().optional(),

  // Chatwoot
  CHATWOOT_BASE_URL: Joi.string().uri().optional(),
  CHATWOOT_API_KEY: Joi.string().optional(),

  // Storage
  S3_ENDPOINT: Joi.string().uri().optional(),
  S3_BUCKET: Joi.string().optional(),
  S3_ACCESS_KEY: Joi.string().optional(),
  S3_SECRET_KEY: Joi.string().optional(),
  S3_REGION: Joi.string().default('us-east-1'),
  CDN_URL: Joi.string().uri().optional(),

  // Payment Gateways
  FAWRY_BASE_URL: Joi.string().uri().optional(),
  FAWRY_MERCHANT_CODE: Joi.string().optional(),
  FAWRY_SECURITY_KEY: Joi.string().optional(),
  HEALTHPAY_API_URL: Joi.string().uri().optional(),
  HEALTHPAY_API_KEY: Joi.string().optional(),
  HEALTHPAY_MERCHANT_ID: Joi.string().optional(),

  // AI
  OPENAI_API_KEY: Joi.string().optional(),
  ANTHROPIC_API_KEY: Joi.string().optional(),

  // WasslBox
  WASSLBOX_API_URL: Joi.string().uri().optional(),
  WASSLBOX_API_KEY: Joi.string().optional(),

  // Valify
  VALIFY_API_URL: Joi.string().uri().optional(),
  VALIFY_API_KEY: Joi.string().optional(),

  // Throttling
  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(100),

  // CORS
  CORS_ORIGINS: Joi.string().default('*'),

  // Logging
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug', 'verbose')
    .default('info'),

  // Sentry
  SENTRY_DSN: Joi.string().uri().optional().allow(''),
});
