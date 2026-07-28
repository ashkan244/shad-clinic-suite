import { Role } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AuditService } from './audit.service.js';

describe('AuditService', () => {
  it('serializes meta to JSON and writes the entry', async () => {
    const create = vi.fn().mockResolvedValue({});
    const prisma = { auditLog: { create } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await new AuditService(prisma as any).log({
      actorId: 'u1',
      actorRole: Role.ADMIN,
      action: 'doctor.update',
      entity: 'StaffProfile',
      entityId: 'd1',
      meta: { active: false }
    });
    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    expect(data.action).toBe('doctor.update');
    expect(data.meta).toBe(JSON.stringify({ active: false }));
  });

  it('never throws even when the write fails', async () => {
    const prisma = { auditLog: { create: vi.fn().mockRejectedValue(new Error('db down')) } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(new AuditService(prisma as any).log({ action: 'x', entity: 'Y' })).resolves.toBeUndefined();
  });
});
