import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../prisma/prisma.service';

export interface TenantContext {
  tenantId: string | null;
  isSuperadmin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      tenantContext?: TenantContext;
    }
  }
}

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantContextMiddleware.name);

  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    try {
      // Extract tenant ID from various sources
      let tenantId: string | null = null;
      let isSuperadmin = false;

      // 1. From JWT token (set by JwtAuthGuard)
      if (req.user && (req.user as any).tenantId) {
        tenantId = (req.user as any).tenantId;
        isSuperadmin = (req.user as any).role === 'SUPERADMIN';
      }

      // 2. From X-Tenant-ID header (for API key auth)
      if (!tenantId && req.headers['x-tenant-id']) {
        tenantId = req.headers['x-tenant-id'] as string;
      }

      // 3. From subdomain
      if (!tenantId) {
        const host = req.headers.host || '';
        const subdomain = this.extractSubdomain(host);
        if (subdomain && subdomain !== 'api' && subdomain !== 'app') {
          // Look up tenant by subdomain
          const tenant = await this.prisma.executeAsSuperadmin(async (tx) => {
            return tx.tenant.findUnique({
              where: { subdomain },
              select: { id: true },
            });
          });
          if (tenant) {
            tenantId = tenant.id;
          }
        }
      }

      // Set tenant context
      req.tenantContext = {
        tenantId,
        isSuperadmin,
      };

      // Set PostgreSQL session variables for RLS
      if (tenantId || isSuperadmin) {
        await this.prisma.setTenantContext(tenantId, isSuperadmin);
      }

      // Clean up on response finish
      res.on('finish', async () => {
        try {
          await this.prisma.clearTenantContext();
        } catch (error) {
          // Ignore errors during cleanup
        }
      });

      next();
    } catch (error) {
      this.logger.error('Error in tenant context middleware', error);
      next(error);
    }
  }

  private extractSubdomain(host: string): string | null {
    // Remove port if present
    const hostname = host.split(':')[0];
    
    // Handle localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return null;
    }

    // Extract subdomain from hostname
    const parts = hostname.split('.');
    if (parts.length >= 3) {
      return parts[0];
    }

    return null;
  }
}
