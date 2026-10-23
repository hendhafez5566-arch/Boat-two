export const platformPermissions = [
  'companies.write',
  'users.write',
  'sessions.revoke',
  'subscriptions.write',
  'plans.write',
] as const;
export type PlatformPermission = (typeof platformPermissions)[number];
export const operatorRoles = {
  reader: [],
  support: ['companies.write', 'users.write'],
  security: ['sessions.revoke'],
  billing: ['subscriptions.write'],
  catalog: ['plans.write'],
  administrator: [...platformPermissions],
} satisfies Record<string, PlatformPermission[]>;
export function operatorPermissions(configuration: string, userId: string): PlatformPermission[] {
  let raw: unknown;
  try {
    raw = JSON.parse(configuration);
  } catch {
    return [];
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const roles = (raw as Record<string, unknown>)[userId];
  if (
    !Array.isArray(roles) ||
    roles.some((role) => typeof role !== 'string' || !Object.hasOwn(operatorRoles, role))
  )
    return [];
  return [...new Set(roles.flatMap((role) => operatorRoles[role as keyof typeof operatorRoles]))];
}
