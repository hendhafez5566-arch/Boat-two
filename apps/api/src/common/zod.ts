import { BadRequestException } from '@nestjs/common';
import { z, ZodType, output } from 'zod';

/** PATCH accepts only supplied keys, even when a field's create schema has defaults. */
export function sparsePatch<S extends ZodType>(schema: S) {
  return z.unknown().transform((input, ctx): output<S> => {
    const result = schema.safeParse(input);
    if (!result.success) {
      for (const issue of result.error.issues) ctx.addIssue({ ...issue });
      return z.NEVER;
    }
    if (input && typeof input === 'object' && !Array.isArray(input) &&
        result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
      for (const key of Object.keys(result.data)) {
        if (!Object.hasOwn(input, key)) delete (result.data as Record<string, unknown>)[key];
      }
    }
    return result.data;
  });
}

export function parse<S extends ZodType>(schema: S, body: unknown): output<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({ code: 'VALIDATION', errors: result.error.flatten().fieldErrors, issues: result.error.issues.map(({path, code, message}) => ({path, code, message})) });
  }
  return result.data;
}
