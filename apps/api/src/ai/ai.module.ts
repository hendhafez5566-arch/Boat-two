import { KnowledgeJobsController } from './knowledge/jobs.controller';
import { EmbeddingBudget } from './knowledge/embedding-budget';
import { AgentsController } from './agents.controller';
import { CryptoService } from '../messaging/crypto.service';
import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { KnowledgeService } from './knowledge/knowledge.service';

@Module({
  controllers: [KnowledgeJobsController,AiController, AgentsController],
  providers: [EmbeddingBudget, KnowledgeService, AiService, CryptoService],
  exports: [AiService],
})
export class AiModule {}
