import type { Request } from 'express';

export type Role = 'owner' | 'admin' | 'agent';

export interface AuthUser {
  userId: string;
  tenantId: string;
  role: Role;
}

export interface AuthedRequest extends Request {
  user: AuthUser;
}
