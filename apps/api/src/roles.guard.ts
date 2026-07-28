import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from './auth.decorators.js';

/** Enforces @Roles(...) metadata. Runs after JwtAuthGuard, so req.user is set. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!roles || roles.length === 0) return true;
    const req = context.switchToHttp().getRequest<{ user?: { role?: Role } }>();
    if (!req.user?.role || !roles.includes(req.user.role)) {
      throw new ForbiddenException('شما به این بخش دسترسی ندارید.');
    }
    return true;
  }
}
