import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { Prisma } from '@wasslchat/database';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TypebotService } from './typebot.service';
import { N8nService } from './n8n.service';

export interface CreateChatbotFlowDto {
  name: string;
  nameAr?: string;
  description?: string;
  flowType: 'BUILTIN' | 'TYPEBOT' | 'N8N';
  typebotId?: string;
  n8nWebhookPath?: string;
  n8nWorkflowId?: string;
  triggers?: {
    keywords?: string[];
    patterns?: string[];
    intents?: string[];
    onFirstMessage?: boolean;
    allMessages?: boolean;
  };
  steps?: any[];
  isActive?: boolean;
  priority?: number;
}

@Injectable()
export class ChatbotsService {
  private readonly logger = new Logger(ChatbotsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly typebotService: TypebotService,
    private readonly n8nService: N8nService,
  ) {}

  async create(tenantId: string, dto: CreateChatbotFlowDto) {
    // Check plan limits
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: true },
    });

    const currentCount = await this.prisma.chatbotFlow.count({ where: { tenantId } });
    if (tenant.plan.chatbotFlowsLimit !== -1 && currentCount >= tenant.plan.chatbotFlowsLimit) {
      throw new BadRequestException(
        `لقد وصلت للحد الأقصى من تدفقات الشات بوت (${tenant.plan.chatbotFlowsLimit})`,
      );
    }

    // Validate Typebot ID if using Typebot
    if (dto.flowType === 'TYPEBOT' && dto.typebotId) {
      const typebot = await this.typebotService.getTypebot(dto.typebotId);
      if (!typebot) {
        throw new BadRequestException('معرف Typebot غير صالح');
      }
    }

    const flow = await this.prisma.chatbotFlow.create({
      data: {
        tenantId,
        name: dto.name,
        nameAr: dto.nameAr,
        description: dto.description,
        flowType: dto.flowType,
        typebotId: dto.typebotId,
        n8nWebhookPath: dto.n8nWebhookPath,
        n8nWorkflowId: dto.n8nWorkflowId,
        triggers: dto.triggers || {},
        steps: dto.steps || [],
        isActive: dto.isActive ?? true,
        priority: dto.priority || 0,
      },
    });

    this.logger.log(`Chatbot flow created: ${flow.id}`);
    return flow;
  }

  async findAll(tenantId: string, includeInactive = false) {
    const where: Prisma.ChatbotFlowWhereInput = {
      tenantId,
      ...(!includeInactive && { isActive: true }),
    };

    const flows = await this.prisma.chatbotFlow.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });

    return flows;
  }

  async findOne(tenantId: string, id: string) {
    const flow = await this.prisma.chatbotFlow.findFirst({
      where: { id, tenantId },
    });

    if (!flow) {
      throw new NotFoundException('تدفق الشات بوت غير موجود');
    }

    return flow;
  }

  async update(tenantId: string, id: string, dto: Partial<CreateChatbotFlowDto>) {
    const flow = await this.prisma.chatbotFlow.findFirst({ where: { id, tenantId } });
    if (!flow) {
      throw new NotFoundException('تدفق الشات بوت غير موجود');
    }

    return this.prisma.chatbotFlow.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.nameAr !== undefined && { nameAr: dto.nameAr }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.flowType && { flowType: dto.flowType }),
        ...(dto.typebotId !== undefined && { typebotId: dto.typebotId }),
        ...(dto.n8nWebhookPath !== undefined && { n8nWebhookPath: dto.n8nWebhookPath }),
        ...(dto.n8nWorkflowId !== undefined && { n8nWorkflowId: dto.n8nWorkflowId }),
        ...(dto.triggers && { triggers: dto.triggers }),
        ...(dto.steps && { steps: dto.steps }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
      },
    });
  }

  async delete(tenantId: string, id: string) {
    const flow = await this.prisma.chatbotFlow.findFirst({ where: { id, tenantId } });
    if (!flow) {
      throw new NotFoundException('تدفق الشات بوت غير موجود');
    }

    await this.prisma.chatbotFlow.delete({ where: { id } });
    this.logger.log(`Chatbot flow deleted: ${id}`);
  }

  async toggleActive(tenantId: string, id: string) {
    const flow = await this.prisma.chatbotFlow.findFirst({ where: { id, tenantId } });
    if (!flow) {
      throw new NotFoundException('تدفق الشات بوت غير موجود');
    }

    return this.prisma.chatbotFlow.update({
      where: { id },
      data: { isActive: !flow.isActive },
    });
  }

  async reorder(tenantId: string, items: Array<{ id: string; priority: number }>) {
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.chatbotFlow.updateMany({
          where: { id: item.id, tenantId },
          data: { priority: item.priority },
        }),
      ),
    );
    return { success: true };
  }

  // External integrations
  async listTypebots() {
    return this.typebotService.listTypebots();
  }

  async listN8nWorkflows(active?: boolean) {
    return this.n8nService.listWorkflows(active);
  }

  async testN8nWebhook(tenantId: string, webhookPath: string, testData: any) {
    return this.n8nService.triggerTestWebhook(webhookPath, {
      ...testData,
      tenantId,
      test: true,
    });
  }

  // Analytics
  async getStats(tenantId: string) {
    const flows = await this.prisma.chatbotFlow.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        isActive: true,
        triggeredCount: true,
        handoffCount: true,
        completedCount: true,
      },
    });

    const totalTriggered = flows.reduce((sum, f) => sum + f.triggeredCount, 0);
    const totalHandoffs = flows.reduce((sum, f) => sum + f.handoffCount, 0);
    const totalCompleted = flows.reduce((sum, f) => sum + f.completedCount, 0);

    return {
      totalFlows: flows.length,
      activeFlows: flows.filter((f) => f.isActive).length,
      totalTriggered,
      totalHandoffs,
      totalCompleted,
      automationRate: totalTriggered > 0 
        ? ((totalCompleted / totalTriggered) * 100).toFixed(2)
        : 0,
      flows: flows.map((f) => ({
        id: f.id,
        name: f.name,
        isActive: f.isActive,
        triggeredCount: f.triggeredCount,
        handoffCount: f.handoffCount,
        completedCount: f.completedCount,
        completionRate: f.triggeredCount > 0 
          ? ((f.completedCount / f.triggeredCount) * 100).toFixed(2)
          : 0,
      })),
    };
  }

  // Increment counters
  async incrementTriggered(flowId: string) {
    await this.prisma.chatbotFlow.update({
      where: { id: flowId },
      data: { triggeredCount: { increment: 1 } },
    });
  }

  async incrementHandoff(flowId: string) {
    await this.prisma.chatbotFlow.update({
      where: { id: flowId },
      data: { handoffCount: { increment: 1 } },
    });
  }

  async incrementCompleted(flowId: string) {
    await this.prisma.chatbotFlow.update({
      where: { id: flowId },
      data: { completedCount: { increment: 1 } },
    });
  }
}
