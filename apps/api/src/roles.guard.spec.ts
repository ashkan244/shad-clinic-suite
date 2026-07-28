import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { RolesGuard } from './roles.guard.js';

function ctx(user?: { role?: Role }) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => null,
    getClass: () => null
  } as never;
}

function makeGuard(roles?: Role[]) {
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(roles) } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('allows the route when no @Roles metadata is set', () => {
    expect(makeGuard(undefined).canActivate(ctx({ role: Role.PATIENT }))).toBe(true);
  });

  it('allows when the user role is in the permitted list', () => {
    expect(makeGuard([Role.ADMIN, Role.RECEPTION]).canActivate(ctx({ role: Role.ADMIN }))).toBe(true);
  });

  it('forbids when the user role is not permitted', () => {
    expect(() => makeGuard([Role.ADMIN]).canActivate(ctx({ role: Role.PATIENT }))).toThrow(ForbiddenException);
  });

  it('forbids when there is no authenticated user', () => {
    expect(() => makeGuard([Role.ADMIN]).canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });
});
