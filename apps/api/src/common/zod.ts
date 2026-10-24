import { BadRequestException } from '@nestjs/common';
import { ZodType, ZodTypeDef } from 'zod';

export function parse<T>(schema: ZodType<T, ZodTypeDef, unknown>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({ code: 'VALIDATION', errors: result.error.flatten().fieldErrors, issues: result.error.issues.map(({path, code, message}) => ({path, code, message})) });
  }
  return result.data;
}
