import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockPaymentProvider, PaymentService, ZarinpalPaymentProvider } from './payment.service.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('MockPaymentProvider', () => {
  it('issues an authority and verifies successfully', async () => {
    const provider = new MockPaymentProvider();
    const requested = await provider.request(1000, 'http://callback', 'order x');
    expect(requested.authority).toMatch(/^MOCK-/);
    expect(requested.url).toContain('authority=');
    const verified = await provider.verify(requested.authority, 1000);
    expect(verified.ok).toBe(true);
    expect(verified.refId).toBeTruthy();
  });
});

describe('ZarinpalPaymentProvider.verify', () => {
  it('returns ok + refId on code 100', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ data: { code: 100, ref_id: 555 } }) }));
    const result = await new ZarinpalPaymentProvider('merchant').verify('A', 1000);
    expect(result.ok).toBe(true);
    expect(result.refId).toBe('555');
  });

  it('fails on a non-success code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ data: { code: -51 } }) }));
    const result = await new ZarinpalPaymentProvider('merchant').verify('A', 1000);
    expect(result.ok).toBe(false);
  });
});

describe('PaymentService.verifyOrderPayment', () => {
  it('marks the payment and order as paid on success', async () => {
    const calls = { payment: [] as unknown[], order: [] as unknown[] };
    const prisma = {
      payment: {
        findFirst: vi.fn().mockResolvedValue({ id: 'pay1', amount: 1000, orderId: 'o1' }),
        update: vi.fn().mockImplementation((args) => calls.payment.push(args))
      },
      order: { update: vi.fn().mockImplementation((args) => calls.order.push(args)) }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await new PaymentService(prisma as any).verifyOrderPayment('AUTH');
    expect(result.ok).toBe(true);
    expect((calls.payment[0] as { data: { status: string } }).data.status).toBe('PAID');
    expect((calls.order[0] as { data: { status: string } }).data.status).toBe('PAID');
  });

  it('throws when no pending payment matches the authority', async () => {
    const prisma = { payment: { findFirst: vi.fn().mockResolvedValue(null) } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(new PaymentService(prisma as any).verifyOrderPayment('X')).rejects.toBeTruthy();
  });
});
