import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators';
import { PlansService } from './plans.service';

@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Public() @Get()
  list() {
    return this.plans.listPublic();
  }
}
