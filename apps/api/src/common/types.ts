import type { Request } from 'express';

export type Role = 'owner' | 'admin' | 'agent';

export interface AuthUser {
  userId: string;
  tenantId: string;
  role: Role;
  sessionId?: string;
  sessionVersion?: number;
}

export interface AuthedRequest extends Request {
  user: AuthUser;
}
