# Contributing to WasslChat

Thank you for your interest in contributing to WasslChat! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker & Docker Compose
- Git

### Getting Started

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/your-username/wasslchat.git
   cd wasslchat
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start infrastructure**
   ```bash
   docker-compose up -d
   ```

5. **Run database migrations**
   ```bash
   pnpm db:migrate
   pnpm db:seed
   ```

6. **Start development server**
   ```bash
   pnpm dev
   ```

## Code Style

We use ESLint and Prettier for code formatting. Please ensure your code follows our style guidelines:

```bash
# Check linting
pnpm lint

# Fix linting issues
pnpm lint:fix

# Format code
pnpm format
```

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```
feat(auth): add social login with Google
fix(orders): resolve duplicate order creation
docs(readme): update installation instructions
```

## Pull Request Process

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write clean, documented code
   - Add tests for new functionality
   - Update documentation if needed

3. **Run tests**
   ```bash
   pnpm test
   pnpm lint
   pnpm typecheck
   ```

4. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

5. **PR Requirements**
   - Clear description of changes
   - Link to related issue (if any)
   - All tests passing
   - Code review approval

## Project Structure

```
wasslchat/
├── apps/
│   ├── api/          # NestJS backend
│   ├── dashboard/    # Admin dashboard
│   └── web/          # Merchant portal
├── packages/
│   ├── database/     # Prisma schema
│   ├── shared/       # Shared utilities
│   └── ui/           # UI components
└── infrastructure/   # Deployment configs
```

## Testing

```bash
# Unit tests
pnpm test

# E2E tests
pnpm test:e2e

# Coverage report
pnpm test:cov
```

## Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for public APIs
- Update API documentation (Swagger)

## Questions?

Feel free to open an issue for questions or discussions.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
