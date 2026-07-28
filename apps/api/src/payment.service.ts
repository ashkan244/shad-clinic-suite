import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

export type PaymentRequestResult = { authority: string; url: string };
export type PaymentVerifyResult = { ok: boolean; refId?: string; error?: string };

/**
 * Pluggable online-payment gateway. Add a real Iranian gateway (Zarinpal,
 * IDPay, Zibal, NextPay, ...) by implementing this interface and wiring it into
 * PaymentService.resolveProvider — the order/invoice logic stays unchanged.
 */
export interface PaymentProvider {
  readonly name: string;
  /** Start a payment; returns the gateway authority + redirect URL. */
  request(amount: number, callbackUrl: string, description: string): Promise<PaymentRequestResult>;
  /** Confirm a payment after the gateway callback. */
  verify(authority: string, amount: number): Promise<PaymentVerifyResult>;
}

/** Sandbox gateway — succeeds immediately. Lets the full flow run with no credentials. */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  async request(_amount: number, callbackUrl: string, _description: string): Promise<PaymentRequestResult> {
    const authority = `MOCK-${randomUUID()}`;
    const sep = callbackUrl.includes('?') ? '&' : '?';
    return { authority, url: `${callbackUrl}${sep}authority=${authority}` };
  }

  async verify(authority: string, _amount: number): Promise<PaymentVerifyResult> {
    return { ok: true, refId: `REF-${authority.slice(-8)}` };
  }
}

/** Zarinpal (zarinpal.com) gateway. Amount in Rial. */
export class ZarinpalPaymentProvider implements PaymentProvider {
  readonly name = 'zarinpal';

  constructor(private readonly merchantId: string) {}

  async request(amount: number, callbackUrl: string, description: string): Promise<PaymentRequestResult> {
    const res = await fetch('https://api.zarinpal.com/pg/v4/payment/request.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ merchant_id: this.merchantId, amount, callback_url: callbackUrl, description })
    });
    const data = (await res.json()) as { data?: { authority?: string; code?: number } };
    const authority = data.data?.authority;
    if (!authority) throw new BadRequestException('ایجاد تراکنش در درگاه ناموفق بود.');
    return { authority, url: `https://www.zarinpal.com/pg/StartPay/${authority}` };
  }

  async verify(authority: string, amount: number): Promise<PaymentVerifyResult> {
    try {
      const res = await fetch('https://api.zarinpal.com/pg/v4/payment/verify.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ merchant_id: this.merchantId, amount, authority })
      });
      const data = (await res.json()) as { data?: { code?: number; ref_id?: number } };
      const code = data.data?.code;
      if (code === 100 || code === 101) {
        return { ok: true, refId: data.data?.ref_id ? String(data.data.ref_id) : undefined };
      }
      return { ok: false, error: `code ${code ?? 'unknown'}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly provider: PaymentProvider;

  constructor(private readonly prisma: PrismaService) {
    this.provider = this.resolveProvider(process.env.PAYMENT_PROVIDER ?? 'mock');
    this.logger.log(`Payment provider: ${this.provider.name}`);
  }

  get providerName() {
    return this.provider.name;
  }

  private resolveProvider(name: string): PaymentProvider {
    switch (name) {
      case 'mock':
        return new MockPaymentProvider();
      case 'zarinpal': {
        const merchantId = process.env.ZARINPAL_MERCHANT_ID;
        if (!merchantId) {
          this.logger.warn('PAYMENT_PROVIDER=zarinpal but ZARINPAL_MERCHANT_ID is missing; falling back to mock');
          return new MockPaymentProvider();
        }
        return new ZarinpalPaymentProvider(merchantId);
      }
      default:
        this.logger.warn(`Unknown PAYMENT_PROVIDER "${name}", falling back to mock`);
        return new MockPaymentProvider();
    }
  }

  /** Start an online payment for an order; persists a PENDING payment with the gateway authority. */
  async requestOrderPayment(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('سفارش پیدا نشد.');
    if (order.status === 'PAID') throw new BadRequestException('این سفارش قبلاً پرداخت شده است.');
    if (order.total <= 0) throw new BadRequestException('مبلغ سفارش نامعتبر است.');

    const callbackUrl = process.env.PAYMENT_CALLBACK_URL ?? 'http://localhost:5173/payment/callback';
    const gateway = await this.provider.request(order.total, callbackUrl, `سفارش ${orderId}`);

    await this.prisma.payment.create({
      data: {
        orderId,
        patientId: order.patientId,
        amount: order.total,
        method: 'online',
        reference: gateway.authority,
        status: 'PENDING'
      }
    });

    return { authority: gateway.authority, url: gateway.url, provider: this.provider.name };
  }

  /** Verify a payment after the gateway callback; on success marks the payment + order as paid. */
  async verifyOrderPayment(authority: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { reference: authority, status: 'PENDING' }
    });
    if (!payment) throw new NotFoundException('تراکنش در انتظار پیدا نشد.');

    const result = await this.provider.verify(authority, payment.amount);
    if (!result.ok) {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
      return { ok: false, error: result.error };
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'PAID', reference: result.refId ?? authority }
    });
    if (payment.orderId) {
      await this.prisma.order.update({ where: { id: payment.orderId }, data: { status: 'PAID' } });
    }
    return { ok: true, orderId: payment.orderId, refId: result.refId };
  }

  /** Full invoice for an order (items + product names + payments). */
  async orderInvoice(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        patient: { include: { user: true } },
        items: { include: { product: true } },
        payments: true
      }
    });
    if (!order) throw new NotFoundException('سفارش پیدا نشد.');
    return order;
  }
}
