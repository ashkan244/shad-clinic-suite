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

const VALID_ID = '1741234565';

describe('AuthService.registerPatient', () => {
  it('rejects an invalid national ID', async () => {
    await expect(
      makeService({}).registerPatient({ fullName: 'A', phone: '09', nationalId: '1234567890', password: 'pass' })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an already-registered phone', async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ id: 'exists' }) } };
    await expect(
      makeService(prisma).registerPatient({ fullName: 'A', phone: '09', nationalId: VALID_ID, password: 'pass' })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an already-registered national ID', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
      patient: { findUnique: vi.fn().mockResolvedValue({ id: 'p0' }) }
    };
    await expect(
      makeService(prisma).registerPatient({ fullName: 'A', phone: '09', nationalId: VALID_ID, password: 'pass' })
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
      user: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(created) },
      patient: { findUnique: vi.fn().mockResolvedValue(null) }
    };
    const res = await makeService(prisma).registerPatient({ fullName: 'A', phone: '09', nationalId: VALID_ID, password: 'pass' });
    expect(res.accessToken).toBe('signed.jwt.token');
    expect(res.user).not.toHaveProperty('passwordHash');
  });
});

describe('AuthService.loginPatient', () => {
  it('rejects unknown credentials', async () => {
    const prisma = { patient: { findUnique: vi.fn().mockResolvedValue(null) } };
    await expect(
      makeService(prisma).loginPatient({ nationalId: VALID_ID, password: 'x' })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns a token for valid national ID + password', async () => {
    const passwordHash = await bcrypt.hash('pass', 10);
    const findUnique = vi.fn().mockResolvedValue({
      id: 'p1',
      user: {
        id: 'u1',
        role: Role.PATIENT,
        phone: '09',
        fullName: 'A',
        passwordHash,
        patient: { id: 'p1' }
      }
    });
    const res = await makeService({ patient: { findUnique } }).loginPatient({ nationalId: VALID_ID, password: 'pass' });
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { nationalId: VALID_ID } }));
    expect(res.accessToken).toBe('signed.jwt.token');
    expect(res.user).not.toHaveProperty('passwordHash');
  });
});

describe('AuthService national-ID OTP', () => {
  const patientRow = { id: 'p1', userId: 'u1' };
  const makeOtpService = () => {
    const prisma = {
      patient: { findUnique: vi.fn().mockResolvedValue(patientRow) },
      user: { findUnique: vi.fn().mockResolvedValue({ id: 'u1', role: Role.PATIENT, phone: '09', fullName: 'A', passwordHash: 'h' }) }
    };
    notifications.notify.mockClear();
    return makeService(prisma);
  };
  const sentCode = () => String(notifications.notify.mock.calls.at(-1)?.[0].body.match(/\d{6}/)?.[0]);

  it('sends a 6-digit code and does not resend within the cooldown', async () => {
    const svc = makeOtpService();
    await svc.requestNationalIdOtp(VALID_ID);
    await svc.requestNationalIdOtp(VALID_ID);
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(sentCode()).toMatch(/^\d{6}$/);
  });

  it('burns the code after too many wrong guesses', async () => {
    const svc = makeOtpService();
    await svc.requestNationalIdOtp(VALID_ID);
    const code = sentCode();
    for (let i = 0; i < 5; i++) {
      await expect(svc.verifyNationalIdOtp(VALID_ID, 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
    }
    await expect(svc.verifyNationalIdOtp(VALID_ID, code)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('signs in with the correct code', async () => {
    const svc = makeOtpService();
    await svc.requestNationalIdOtp(VALID_ID);
    const res = await svc.verifyNationalIdOtp(VALID_ID, sentCode());
    expect(res.accessToken).toBe('signed.jwt.token');
  });
});
