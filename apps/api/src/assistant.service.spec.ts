import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  ASSISTANT_SYSTEM_PROMPT,
  AssistantService,
  MockAssistantProvider,
  OpenRouterAssistantProvider
} from './assistant.service.js';

const ok = (content: string) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) });
const fail = (status: number) => ({ ok: false, status, json: async () => ({}) });
const asFetch = (fn: unknown) => fn as typeof fetch;
const msgs = [{ role: 'user' as const, content: 'سلام' }];

describe('AssistantService.resolveProvider', () => {
  it('defaults to mock and falls back to mock without a key', () => {
    expect(AssistantService.resolveProvider({}).name).toBe('mock');
    expect(AssistantService.resolveProvider({ ASSISTANT_PROVIDER: 'openrouter' }).name).toBe('mock');
  });

  it('uses openrouter when a key is set', () => {
    expect(AssistantService.resolveProvider({ ASSISTANT_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'k' }).name).toBe('openrouter');
  });
});

describe('MockAssistantProvider', () => {
  it('answers booking and urgent questions', async () => {
    const p = new MockAssistantProvider();
    expect(await p.reply([{ role: 'user', content: 'چطور نوبت بگیرم؟' }])).toContain('ثبت نوبت');
    expect(await p.reply([{ role: 'user', content: 'دندانم درد شدید دارد' }])).toContain('تماس');
  });
});

describe('OpenRouterAssistantProvider', () => {
  it('sends the system prompt + history with the bearer key and returns the reply', async () => {
    const f = vi.fn().mockResolvedValue(ok('  سلام!  '));
    const p = new OpenRouterAssistantProvider('secret', ['m1'], 'https://x.test/v1', asFetch(f));
    expect(await p.reply(msgs)).toBe('سلام!');
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://x.test/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer secret');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('m1');
    expect(body.messages[0]).toEqual({ role: 'system', content: ASSISTANT_SYSTEM_PROMPT });
    expect(body.messages[1]).toEqual(msgs[0]);
  });

  it('falls through to the next model when one is rate limited', async () => {
    const f = vi.fn().mockResolvedValueOnce(fail(429)).mockResolvedValueOnce(ok('از مدل دوم'));
    const p = new OpenRouterAssistantProvider('k', ['m1', 'm2'], undefined, asFetch(f));
    expect(await p.reply(msgs)).toBe('از مدل دوم');
    expect(JSON.parse(f.mock.calls[1][1].body).model).toBe('m2');
  });

  it('throws a friendly 503 when every model fails', async () => {
    const f = vi.fn().mockRejectedValue(new Error('network'));
    const p = new OpenRouterAssistantProvider('k', ['m1', 'm2'], undefined, asFetch(f));
    await expect(p.reply(msgs)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
