import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, Query,
  UseGuards, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ContactsService } from './contacts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, TenantId, CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Contacts')
@ApiBearerAuth('JWT-auth')
@Controller({ path: 'contacts', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Post()
  @ApiOperation({ summary: 'Create new contact' })
  async create(@TenantId() tenantId: string, @Body() dto: any) {
    return this.contactsService.create(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all contacts' })
  async findAll(@TenantId() tenantId: string, @Query() query: any) {
    return this.contactsService.findAll(tenantId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get contact statistics' })
  async getStats(@TenantId() tenantId: string) {
    return this.contactsService.getStats(tenantId);
  }

  @Get('groups')
  @ApiOperation({ summary: 'List contact groups' })
  async getGroups(@TenantId() tenantId: string) {
    return this.contactsService.getGroups(tenantId);
  }

  @Post('groups')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Create contact group' })
  async createGroup(@TenantId() tenantId: string, @Body() dto: any) {
    return this.contactsService.createGroup(tenantId, dto);
  }

  @Delete('groups/:groupId')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete contact group' })
  async deleteGroup(@TenantId() tenantId: string, @Param('groupId', ParseUUIDPipe) groupId: string) {
    await this.contactsService.deleteGroup(tenantId, groupId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get contact by ID' })
  async findOne(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.contactsService.findOne(tenantId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update contact' })
  async update(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return this.contactsService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete contact' })
  async delete(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.contactsService.delete(tenantId, id);
  }

  @Post(':id/notes')
  @ApiOperation({ summary: 'Add note to contact' })
  async addNote(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('content') content: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.contactsService.addNote(tenantId, id, content, userId);
  }

  @Patch(':id/tags')
  @ApiOperation({ summary: 'Update contact tags' })
  async updateTags(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('tags') tags: string[],
  ) {
    return this.contactsService.updateTags(tenantId, id, tags);
  }

  @Post(':id/groups/:groupId')
  @ApiOperation({ summary: 'Add contact to group' })
  async addToGroup(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.contactsService.addToGroup(tenantId, id, groupId);
  }

  @Delete(':id/groups/:groupId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove contact from group' })
  async removeFromGroup(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    await this.contactsService.removeFromGroup(tenantId, id, groupId);
  }
}
