# WasslChat 🚀

> WhatsApp-powered Commerce Platform for Egyptian Businesses

[![CI/CD](https://github.com/your-org/wasslchat/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/wasslchat/actions/workflows/ci.yml)
[![Deploy](https://github.com/your-org/wasslchat/actions/workflows/deploy.yml/badge.svg)](https://github.com/your-org/wasslchat/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

WasslChat is a comprehensive WhatsApp commerce platform designed specifically for the Egyptian market, enabling businesses to sell products, manage orders, and provide customer support through WhatsApp.

## ✨ Features

### 💬 WhatsApp Integration
- Evolution API integration for WhatsApp Business
- Multi-device support with QR code authentication
- Real-time message sync and webhooks
- Media handling (images, videos, documents)

### 🛒 E-Commerce
- Product catalog management
- Order processing with multiple statuses
- WooCommerce & Shopify sync
- Inventory tracking with low-stock alerts

### 💳 Egyptian Payment Gateways
- **HealthPay** - Digital wallets & card payments
- **Fawry** - Reference code payments
- **Vodafone Cash** - Mobile money

### 🚚 Egyptian Shipping
- **WasslBox** - Same-day & next-day delivery
- **Bosta** - Nationwide coverage
- COD (Cash on Delivery) support
- Real-time tracking

### 🤖 AI-Powered Features
- Smart reply suggestions (OpenAI GPT-4)
- Intent classification
- Sentiment analysis
- Conversation summarization (Claude)
- Auto-response for common queries

### 📊 Analytics
- Real-time dashboard
- Sales reports
- Customer insights with RFM analysis
- Conversation metrics

### 🔄 Automation
- Chatbot builder (Typebot integration)
- Workflow automation (n8n integration)
- Broadcast campaigns
- Scheduled messages

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Load Balancer                             │
│                    (DigitalOcean / Nginx)                       │
└─────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│   Dashboard   │      │   Merchant    │      │     API       │
│    (Next.js)  │      │    Portal     │      │   (NestJS)    │
└───────────────┘      └───────────────┘      └───────────────┘
                                                      │
        ┌─────────────────────────────────────────────┤
        ▼                       ▼                     ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│  PostgreSQL   │      │    Redis      │      │ Evolution API │
│   (Primary)   │      │   (Cache)     │      │  (WhatsApp)   │
└───────────────┘      └───────────────┘      └───────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker & Docker Compose
- PostgreSQL 15+
- Redis 7+

### Development Setup

```bash
# Clone the repository
git clone https://github.com/your-org/wasslchat.git
cd wasslchat

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Start infrastructure (PostgreSQL, Redis, Evolution API)
docker-compose up -d

# Run database migrations
pnpm db:migrate

# Seed database with sample data
pnpm db:seed

# Start development server
pnpm dev
```

### Environment Variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL=postgresql://wasslchat:wasslchat@localhost:5432/wasslchat

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-super-secret-refresh-key

# WhatsApp (Evolution API)
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=your-evolution-api-key

# AI Services
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Payment Gateways
HEALTHPAY_API_URL=https://api.healthpay.tech
HEALTHPAY_API_KEY=your-key
FAWRY_MERCHANT_CODE=your-code
FAWRY_SECURITY_KEY=your-key

# Shipping
WASSLBOX_API_KEY=your-key
BOSTA_API_KEY=your-key
```

## 📁 Project Structure

```
wasslchat/
├── .github/
│   └── workflows/          # CI/CD pipelines
├── apps/
│   ├── api/                # NestJS backend
│   ├── dashboard/          # Admin dashboard (Next.js)
│   └── web/                # Merchant portal (Next.js)
├── packages/
│   ├── database/           # Prisma schema & migrations
│   ├── shared/             # Shared utilities & types
│   └── ui/                 # Shared UI components
├── infrastructure/
│   ├── docker/             # Docker configurations
│   ├── kubernetes/         # K8s manifests
│   ├── terraform/          # Infrastructure as code
│   └── scripts/            # Deployment scripts
└── docs/                   # Documentation
```

## 🔧 Available Scripts

```bash
# Development
pnpm dev              # Start all apps in development mode
pnpm dev:api          # Start API only
pnpm dev:dashboard    # Start dashboard only

# Building
pnpm build            # Build all apps
pnpm build:api        # Build API only

# Database
pnpm db:migrate       # Run migrations
pnpm db:seed          # Seed database
pnpm db:studio        # Open Prisma Studio

# Testing
pnpm test             # Run all tests
pnpm test:e2e         # Run E2E tests
pnpm test:cov         # Run tests with coverage

# Linting
pnpm lint             # Lint all packages
pnpm format           # Format code with Prettier

# Docker
pnpm docker:build     # Build Docker images
pnpm docker:push      # Push to registry
```

## 🌐 API Documentation

API documentation is available at `/api/docs` when running the server.

### Key Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/v1/auth/login` | User authentication |
| `GET /api/v1/products` | List products |
| `POST /api/v1/orders` | Create order |
| `GET /api/v1/conversations` | List conversations |
| `POST /api/v1/ai/suggestions` | Get AI reply suggestions |
| `GET /api/v1/analytics/dashboard` | Dashboard metrics |

## 🚢 Deployment

### Digital Ocean (Recommended)

```bash
# Deploy to Digital Ocean App Platform
doctl apps create --spec .do/app.yaml

# Or deploy using Terraform
cd infrastructure/terraform
terraform init
terraform apply
```

### Docker

```bash
# Build and run with Docker Compose
docker-compose -f docker-compose.prod.yml up -d
```

### Kubernetes

```bash
# Deploy to Kubernetes cluster
kubectl apply -k infrastructure/kubernetes/production
```

## 🔒 Security

- JWT-based authentication with refresh tokens
- Role-based access control (RBAC)
- Rate limiting on all endpoints
- Data encryption at rest and in transit
- CORS configuration
- Helmet.js security headers

## 📈 Monitoring

- Health checks at `/health`
- Prometheus metrics at `/metrics`
- Structured JSON logging
- Error tracking with Sentry (optional)

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Evolution API](https://github.com/EvolutionAPI/evolution-api) - WhatsApp integration
- [Typebot](https://typebot.io) - Chatbot builder
- [n8n](https://n8n.io) - Workflow automation
- [NestJS](https://nestjs.com) - Backend framework

---

Built with ❤️ for Egyptian businesses by [HealthFlow Group](https://healthflow.tech)
