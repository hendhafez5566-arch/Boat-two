import { z } from 'zod';

export const accountProfileSchema = z
  .object({
    fullName: z.string().trim().min(1).max(120),
    phone: z
      .string()
      .trim()
      .max(25)
      .regex(/^\+?[0-9 ()-]*$/),
    address: z.string().trim().max(1000),
    timezone: z
      .string()
      .max(80)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, 'Invalid timezone'),
    language: z.enum(['ar', 'en']),
  })
  .strict();
export type AccountProfile = z.infer<typeof accountProfileSchema>;

// The authenticated subject is the sole identity selector. Never accept a user ID in the body.
export async function saveAccountProfile(
  db: { query: (sql: string, args: unknown[]) => Promise<{ rows: unknown[] }> },
  userId: string,
  input: AccountProfile,
) {
  return (
    await db.query(
      `UPDATE users SET full_name=$2, account_profile=$3::jsonb
    WHERE id=$1 AND disabled_at IS NULL
    RETURNING id,email,full_name,created_at,account_profile`,
      [
        userId,
        input.fullName,
        JSON.stringify({
          phone: input.phone,
          address: input.address,
          timezone: input.timezone,
          language: input.language,
        }),
      ],
    )
  ).rows[0];
}
