import { afterEach, describe, expect, it, vi } from 'vitest';
import { KavenegarSmsProvider, SmsService } from './sms.service.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SmsService (default mock provider)', () => {
  it('sends via the mock provider and reports success', async () => {
    const result = await new SmsService().send('09120000000', 'hello');
    expect(result.ok).toBe(true);
    expect(result.provider).toBe('mock');
  });
});

describe('KavenegarSmsProvider', () => {
  it('returns ok + messageId on a successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ return: { status: 200 }, entries: [{ messageid: 123 }] })
      })
    );
    const result = await new KavenegarSmsProvider('key', '1000').send('09120000000', 'hi');
    expect(result.ok).toBe(true);
    expect(result.messageId).toBe('123');
  });

  it('returns an error when the gateway rejects the request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ return: { status: 418, message: 'bad key' } })
      })
    );
    const result = await new KavenegarSmsProvider('key').send('09120000000', 'hi');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('bad key');
  });

  it('handles network failures gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const result = await new KavenegarSmsProvider('key').send('09120000000', 'hi');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('network down');
  });
});
