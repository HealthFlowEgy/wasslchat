import {
  Controller, Get, Delete, Param, Query,
  UseGuards, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Messages')
@ApiBearerAuth('JWT-auth')
@Controller({ path: 'messages', version: '1' })
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('conversation/:conversationId')
  @ApiOperation({ summary: 'Get messages by conversation' })
  async getByConversation(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Query() query: any,
  ) {
    return this.messagesService.getByConversation(conversationId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get message by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.messagesService.findOne(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete message' })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    await this.messagesService.delete(id);
  }
}
