import type { Request } from 'express';
import { AuthRateLimit } from './auth-rate-limit';
import { accountProfileSchema } from './account-profile';
import { Body, Controller, Get, HttpCode, Patch, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { Public } from './decorators';
import { AuthService } from './auth.service';

const brandHostname = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/)
  .optional();
const password = z.string().min(8).max(128);

const registerSchema = z.object({
  brandHostname,
  email: z.string().email(),
  password,
  fullName: z.string().min(1).max(120),
  workspaceName: z.string().min(1).max(120),
});
const loginSchema = z.object({
  brandHostname,
  email: z.string().email(),
  password: z.string().min(1).max(128),
  tenantId: z.string().uuid().optional(),
});
const refreshSchema = z.object({ refreshToken: z.string().min(10) });
const switchSchema = z.object({ tenantId: z.string().uuid() });
const acceptSchema = z.object({
  brandHostname,
  token: z.string().min(10),
  password,
  fullName: z.string().min(1).max(120),
});

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly limits: AuthRateLimit) {}

  @Public()
  @Post('register')
  async register(@Req() req: Request, @Body() body: unknown) {
    const input = parse(registerSchema, body);
    await this.limits.consume('register', input.email, req, 3);
    return this.auth.register(input);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Req() req: Request, @Body() body: unknown) {
    const input = parse(loginSchema, body);
    await this.limits.consume('login', input.email, req, 15);
    return this.auth.login(input);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Body() body: unknown) {
    const input = parse(refreshSchema, body);
    await this.limits.consume('refresh', input.refreshToken, req, 60);
    return this.auth.refresh(input.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body() body: unknown) {
    await this.auth.logout(parse(refreshSchema, body).refreshToken);
  }

  @Public()
  @Post('accept-invitation')
  async accept(@Req() req: Request, @Body() body: unknown) {
    const input = parse(acceptSchema, body);
    await this.limits.consume('accept', input.token, req, 5);
    return this.auth.acceptInvitation(input);
  }

  @Post('switch-tenant')
  @HttpCode(200)
  switchTenant(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.auth.switchTenant(req.user.userId, parse(switchSchema, body).tenantId);
  }

  @Patch('profile')
  profile(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.auth.updateProfile(req.user.userId, parse(accountProfileSchema, body));
  }

  @Get('me')
  me(@Req() req: AuthedRequest) {
    return this.auth.me(req.user.userId);
  }
}
