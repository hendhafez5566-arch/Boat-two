export const platformPermissions = [
  'mfa.manage',
  'companies.read',
  'users.read',
  'subscriptions.read',
  'plans.read',
  'audit.read',
  'reports.read',
  'companies.write',
  'users.write',
  'sessions.revoke',
  'subscriptions.write',
  'plans.write',
] as const;
export type PlatformPermission = (typeof platformPermissions)[number];
export const operatorRoles = {
  reader: [
    'mfa.manage',
    'companies.read',
    'users.read',
    'subscriptions.read',
    'plans.read',
    'audit.read',
    'reports.read',
  ],
  support: ['mfa.manage', 'companies.read', 'users.read', 'companies.write', 'users.write'],
  security: ['mfa.manage', 'users.read', 'audit.read', 'sessions.revoke'],
  billing: [
    'mfa.manage',
    'companies.read',
    'subscriptions.read',
    'plans.read',
    'reports.read',
    'subscriptions.write',
  ],
  catalog: ['mfa.manage', 'plans.read', 'plans.write'],
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
