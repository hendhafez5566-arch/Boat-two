import 'reflect-metadata';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Response } from 'express';
import { requestContext } from './common/request-context';
import { AuthedRequest } from './common/types';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  app.useBodyParser('json', { limit: '1mb' });
  app.use((req: AuthedRequest, _res: Response, next: NextFunction) =>
    requestContext.run(req, next),
  );
  app.enableShutdownHooks();
  app.useLogger(app.get(Logger));
  app.enableCors();
  await app.listen(env.API_PORT);
}
bootstrap();
