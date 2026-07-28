import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';

const jwt = { sign: vi.fn().mockReturnValue('signed.jwt.token') };
const notifications = { notify: vi.fn().mockResolvedValue(undefined) };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const makeService = (prisma: unknown) => new AuthService(prisma as any, jwt as any, notifications as any);

describe('AuthService.sanitizeUser', () => {
  it('strips the passwordHash field', () => {
    const out = makeService({}).sanitizeUser({ id: '1', passwordHash: 'secret', fullName: 'A' });
    expect(out).not.toHaveProperty('passwordHash');
    expect(out.id).toBe('1');
  });
});

describe('AuthService.registerPatient', () => {
  it('rejects an already-registered phone', async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ id: 'exists' }) } };
    await expect(
      makeService(prisma).registerPatient({ fullName: 'A', phone: '09', password: 'pass' })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a patient and returns a sanitized user + token', async () => {
    const created = {
      id: 'u1',
      role: Role.PATIENT,
      phone: '09',
      fullName: 'A',
      passwordHash: 'h',
      patient: { id: 'p1' }
    };
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(created) }
    };
    const res = await makeService(prisma).registerPatient({ fullName: 'A', phone: '09', password: 'pass' });
    expect(res.accessToken).toBe('signed.jwt.token');
    expect(res.user).not.toHaveProperty('passwordHash');
  });
});

describe('AuthService.loginPatient', () => {
  it('rejects unknown credentials', async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(null) } };
    await expect(
      makeService(prisma).loginPatient({ phone: '09', password: 'x' })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns a token for valid credentials', async () => {
    const passwordHash = await bcrypt.hash('pass', 10);
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u1',
          role: Role.PATIENT,
          phone: '09',
          fullName: 'A',
          passwordHash,
          patient: { id: 'p1' }
        })
      }
    };
    const res = await makeService(prisma).loginPatient({ phone: '09', password: 'pass' });
    expect(res.accessToken).toBe('signed.jwt.token');
    expect(res.user).not.toHaveProperty('passwordHash');
  });
});
