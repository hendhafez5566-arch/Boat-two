import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators';
import { DatabaseService } from '../database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Public() @Get()
  async check() {
    await this.db.query('SELECT 1');
    return { status: 'ok', db: 'up', time: new Date().toISOString() };
  }
}
