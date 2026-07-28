import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ClinicService } from './clinic.service.js';

/** Build a ClinicService with a partial prisma mock and stubbed collaborators. */
function makeService(prisma: unknown) {
  const notifications = { notify: vi.fn() };
  const reminders = { schedule: vi.fn(), cancel: vi.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new ClinicService(prisma as any, notifications as any, reminders as any);
}

describe('ClinicService.topPatients', () => {
  it('ranks by visit count, drops zero-visit patients', async () => {
    const prisma = {
      patient: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'a', insurance: null, user: { fullName: 'A', phone: '1' }, _count: { appointments: 2 } },
          { id: 'b', insurance: 'X', user: { fullName: 'B', phone: '2' }, _count: { appointments: 5 } },
          { id: 'c', insurance: null, user: { fullName: 'C', phone: '3' }, _count: { appointments: 0 } }
        ])
      }
    };
    const result = await makeService(prisma).topPatients(10);
    expect(result.map((p) => p.id)).toEqual(['b', 'a']);
    expect(result[0].visits).toBe(5);
  });

  it('limits the result set', async () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      id: String(i),
      insurance: null,
      user: { fullName: `P${i}`, phone: `${i}` },
      _count: { appointments: i + 1 }
    }));
    const prisma = { patient: { findMany: vi.fn().mockResolvedValue(many) } };
    expect(await makeService(prisma).topPatients(10)).toHaveLength(10);
  });
});

describe('ClinicService.financeReport', () => {
  it('shapes the aggregated financial report', async () => {
    const prisma = {
      payment: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 1000 } }),
        count: vi.fn().mockResolvedValue(3),
        groupBy: vi.fn().mockResolvedValue([{ method: 'cash', _sum: { amount: 700 }, _count: 2 }]),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'p1',
            amount: 700,
            method: 'cash',
            createdAt: new Date('2026-01-01'),
            patient: { user: { fullName: 'Ali' } }
          }
        ])
      },
      order: { count: vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(4) }
    };
    const report = await makeService(prisma).financeReport();
    expect(report.revenue).toBe(1000);
    expect(report.payments).toBe(3);
    expect(report.byMethod[0]).toEqual({ method: 'cash', amount: 700, count: 2 });
    expect(report.recent[0].patient).toBe('Ali');
  });
});

describe('ClinicService.createAppointment', () => {
  it('rejects a double-booked slot', async () => {
    const prisma = {
      appointment: { findFirst: vi.fn().mockResolvedValue({ id: 'existing' }), create: vi.fn() }
    };
    await expect(
      makeService(prisma).createAppointment({ patientId: 'p', doctorId: 'd', service: 's', date: '1', time: '9' })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });

  it('creates, notifies and schedules a reminder when the slot is free', async () => {
    const created = { id: 'new', patientId: 'p', service: 's', date: '1', time: '9' };
    const prisma = {
      appointment: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
        count: vi.fn().mockResolvedValue(0)
      },
      patient: { findUnique: vi.fn().mockResolvedValue({ id: 'p', userId: 'u' }) }
    };
    const notifications = { notify: vi.fn() };
    const reminders = { schedule: vi.fn(), cancel: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new ClinicService(prisma as any, notifications as any, reminders as any);
    const result = await svc.createAppointment({ patientId: 'p', service: 's', date: '1', time: '9' });
    expect(result).toBe(created);
    expect(reminders.schedule).toHaveBeenCalledWith(created);
    expect(notifications.notify).toHaveBeenCalled();
  });
});

describe('ClinicService.patientUserId', () => {
  it('returns the owning user id', async () => {
    const prisma = { patient: { findUnique: vi.fn().mockResolvedValue({ userId: 'u1' }) } };
    expect(await makeService(prisma).patientUserId('p')).toBe('u1');
  });

  it('returns null when the patient does not exist', async () => {
    const prisma = { patient: { findUnique: vi.fn().mockResolvedValue(null) } };
    expect(await makeService(prisma).patientUserId('p')).toBeNull();
  });
});
