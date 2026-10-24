import { GenerationBudget } from './generation-budget';
import { GenerationController } from './generation.controller';
import { AiToolExecution } from './tool-execution';
import { KnowledgeRetention, KnowledgeRetentionController } from './knowledge/retention';
import { KnowledgeJobsController } from './knowledge/jobs.controller';
import { EmbeddingBudget } from './knowledge/embedding-budget';
import { AgentsController } from './agents.controller';
import { CryptoService } from '../messaging/crypto.service';
import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { KnowledgeService } from './knowledge/knowledge.service';

@Module({
  controllers: [
    GenerationController,
    KnowledgeRetentionController,
    KnowledgeJobsController,
    AiController,
    AgentsController,
  ],
  providers: [
    GenerationBudget,
    AiToolExecution,
    KnowledgeRetention,
    EmbeddingBudget,
    KnowledgeService,
    AiService,
    CryptoService,
  ],
  exports: [AiService],
})
export class AiModule {}
