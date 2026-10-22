import { AsyncLocalStorage } from 'node:async_hooks';
import type { AuthedRequest } from './types';
export const requestContext = new AsyncLocalStorage<AuthedRequest>();
