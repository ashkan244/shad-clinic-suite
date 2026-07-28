import { Injectable, Logger } from '@nestjs/common';

export type SmsResult = {
  provider: string;
  ok: boolean;
  messageId?: string;
  error?: string;
};

/**
 * Pluggable SMS gateway. Add a real Iranian provider (Kavenegar, SMS.ir,
 * Ghasedak, Melipayamak, ...) by implementing this interface and wiring it
 * into SmsService.resolveProvider — the rest of the app stays unchanged.
 */
export interface SmsProvider {
  readonly name: string;
  send(to: string, text: string): Promise<SmsResult>;
}

class MockSmsProvider implements SmsProvider {
  readonly name = 'mock';
  private readonly logger = new Logger('MockSmsProvider');

  async send(to: string, text: string): Promise<SmsResult> {
    this.logger.log(`[mock-sms] to=${to} :: ${text}`);
    return { provider: this.name, ok: true, messageId: `mock_${Date.now()}` };
  }
}

/** Kavenegar (kavenegar.com) — a common Iranian SMS gateway. */
export class KavenegarSmsProvider implements SmsProvider {
  readonly name = 'kavenegar';

  constructor(
    private readonly apiKey: string,
    private readonly sender?: string
  ) {}

  async send(to: string, text: string): Promise<SmsResult> {
    try {
      const url = new URL(`https://api.kavenegar.com/v1/${this.apiKey}/sms/send.json`);
      url.searchParams.set('receptor', to);
      url.searchParams.set('message', text);
      if (this.sender) url.searchParams.set('sender', this.sender);

      const res = await fetch(url, { method: 'POST' });
      const data = (await res.json()) as {
        return?: { status?: number; message?: string };
        entries?: Array<{ messageid?: number }>;
      };
      const status = data.return?.status;
      if (res.ok && (status === 200 || status === 1)) {
        const messageId = data.entries?.[0]?.messageid;
        return { provider: this.name, ok: true, messageId: messageId ? String(messageId) : undefined };
      }
      return { provider: this.name, ok: false, error: data.return?.message ?? `status ${status ?? res.status}` };
    } catch (err) {
      return { provider: this.name, ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly provider: SmsProvider;

  constructor() {
    this.provider = this.resolveProvider(process.env.SMS_PROVIDER ?? 'mock');
    this.logger.log(`SMS provider: ${this.provider.name}`);
  }

  private resolveProvider(name: string): SmsProvider {
    switch (name) {
      case 'mock':
        return new MockSmsProvider();
      case 'kavenegar': {
        const apiKey = process.env.SMS_API_KEY;
        if (!apiKey) {
          this.logger.warn('SMS_PROVIDER=kavenegar but SMS_API_KEY is missing; falling back to mock');
          return new MockSmsProvider();
        }
        return new KavenegarSmsProvider(apiKey, process.env.SMS_SENDER || undefined);
      }
      default:
        this.logger.warn(`Unknown SMS_PROVIDER "${name}", falling back to mock`);
        return new MockSmsProvider();
    }
  }

  send(to: string, text: string): Promise<SmsResult> {
    return this.provider.send(to, text);
  }
}
