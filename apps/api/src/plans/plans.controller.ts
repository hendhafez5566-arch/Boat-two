import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../auth/decorators';
import { PlansService } from './plans.service';

@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Public() @Header('Cache-Control','no-store') @Get()
  list() {
    return this.plans.listPublic();
  }
}
