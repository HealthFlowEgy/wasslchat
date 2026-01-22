import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@wasslchat/database';

@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, 'query' | 'error' | 'warn'>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });
  }

  async onModuleInit() {
    // Log queries in development
    if (process.env.NODE_ENV === 'development') {
      this.$on('query', (event) => {
        this.logger.debug(`Query: ${event.query}`);
        this.logger.debug(`Params: ${event.params}`);
        this.logger.debug(`Duration: ${event.duration}ms`);
      });
    }

    this.$on('error', (event) => {
      this.logger.error(`Prisma Error: ${event.message}`);
    });

    this.$on('warn', (event) => {
      this.logger.warn(`Prisma Warning: ${event.message}`);
    });

    await this.$connect();
    this.logger.log('Connected to database');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Disconnected from database');
  }

  /**
   * Set tenant context for Row Level Security
   * This should be called at the beginning of each request
   */
  async setTenantContext(tenantId: string | null, isSuperadmin = false) {
    if (tenantId) {
      await this.$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${tenantId}'`,
      );
    }
    await this.$executeRawUnsafe(
      `SET LOCAL app.is_superadmin = '${isSuperadmin}'`,
    );
  }

  /**
   * Clear tenant context
   */
  async clearTenantContext() {
    await this.$executeRawUnsafe('RESET app.current_tenant_id');
    await this.$executeRawUnsafe('RESET app.is_superadmin');
  }

  /**
   * Execute a callback within a transaction with tenant context
   */
  async executeWithTenant<T>(
    tenantId: string,
    callback: (prisma: Prisma.TransactionClient) => Promise<T>,
    options?: { isSuperadmin?: boolean },
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${tenantId}'`,
      );
      await tx.$executeRawUnsafe(
        `SET LOCAL app.is_superadmin = '${options?.isSuperadmin ?? false}'`,
      );
      return callback(tx);
    });
  }

  /**
   * Execute a callback as superadmin (bypasses RLS)
   */
  async executeAsSuperadmin<T>(
    callback: (prisma: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.is_superadmin = 'true'`);
      return callback(tx);
    });
  }

  /**
   * Health check for the database connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error('Database health check failed', error);
      return false;
    }
  }

  /**
   * Get database statistics
   */
  async getStats() {
    const [dbSize, connectionCount] = await Promise.all([
      this.$queryRaw<[{ size: string }]>`
        SELECT pg_size_pretty(pg_database_size(current_database())) as size
      `,
      this.$queryRaw<[{ count: bigint }]>`
        SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()
      `,
    ]);

    return {
      databaseSize: dbSize[0].size,
      activeConnections: Number(connectionCount[0].count),
    };
  }
}
