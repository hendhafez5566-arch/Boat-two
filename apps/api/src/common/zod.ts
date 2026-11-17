import { BadRequestException } from '@nestjs/common';
import { ZodType, output } from 'zod';

export function parse<S extends ZodType>(schema: S, body: unknown): output<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({ code: 'VALIDATION', errors: result.error.flatten().fieldErrors, issues: result.error.issues.map(({path, code, message}) => ({path, code, message})) });
  }
  return result.data;
}
