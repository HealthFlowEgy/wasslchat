import { Module } from '@nestjs/common';
import { Service } from './auth.service';
import { Controller } from './auth.controller';

@Module({
  controllers: [Controller],
  providers: [Service],
  exports: [Service],
})
export class Module {}
