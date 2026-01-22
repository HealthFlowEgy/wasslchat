export default () => ({
  // Application
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  apiUrl: process.env.API_URL || 'http://localhost:3000',
  dashboardUrl: process.env.DASHBOARD_URL || 'http://localhost:4000',

  // Database
  database: {
    url: process.env.DATABASE_URL,
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    accessTokenExpiration: process.env.JWT_ACCESS_EXPIRATION || '15m',
    refreshTokenExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
  },

  // Evolution API (WhatsApp)
  evolution: {
    apiUrl: process.env.EVOLUTION_API_URL || 'http://localhost:8080',
    apiKey: process.env.EVOLUTION_API_KEY || '',
    globalWebhookUrl: process.env.EVOLUTION_WEBHOOK_URL || '',
  },

  // Chatwoot
  chatwoot: {
    baseUrl: process.env.CHATWOOT_BASE_URL || 'http://localhost:3000',
    apiKey: process.env.CHATWOOT_API_KEY || '',
  },

  // Storage (S3/MinIO)
  storage: {
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    bucket: process.env.S3_BUCKET || 'wasslchat-media',
    accessKey: process.env.S3_ACCESS_KEY || '',
    secretKey: process.env.S3_SECRET_KEY || '',
    region: process.env.S3_REGION || 'us-east-1',
    cdnUrl: process.env.CDN_URL || '',
  },

  // Payment Gateways
  payments: {
    fawry: {
      baseUrl: process.env.FAWRY_BASE_URL || 'https://atfawry.fawrystaging.com',
      merchantCode: process.env.FAWRY_MERCHANT_CODE || '',
      securityKey: process.env.FAWRY_SECURITY_KEY || '',
    },
    healthpay: {
      apiUrl: process.env.HEALTHPAY_API_URL || '',
      apiKey: process.env.HEALTHPAY_API_KEY || '',
      merchantId: process.env.HEALTHPAY_MERCHANT_ID || '',
    },
    vodafoneCash: {
      merchantId: process.env.VODAFONE_MERCHANT_ID || '',
      apiKey: process.env.VODAFONE_API_KEY || '',
    },
  },

  // AI Services
  ai: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: process.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229',
    },
  },

  // WasslBox Integration
  wasslbox: {
    apiUrl: process.env.WASSLBOX_API_URL || '',
    apiKey: process.env.WASSLBOX_API_KEY || '',
  },

  // National ID Verification (Valify)
  valify: {
    apiUrl: process.env.VALIFY_API_URL || 'https://api.valify.me',
    apiKey: process.env.VALIFY_API_KEY || '',
  },

  // Throttling
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL, 10) || 60,
    limit: parseInt(process.env.THROTTLE_LIMIT, 10) || 100,
  },

  // CORS
  cors: {
    origins: process.env.CORS_ORIGINS || '*',
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },

  // Sentry
  sentry: {
    dsn: process.env.SENTRY_DSN || '',
  },
});
