import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

/** Persona and guardrails sent with every request. */
export const ASSISTANT_SYSTEM_PROMPT = [
  'تو «شاد»، دستیار هوشمند کلینیک دندان‌پزشکی شاد هستی و فقط به فارسی، کوتاه و محترمانه جواب می‌دهی.',
  'فقط درباره‌ی کلینیک (نوبت‌گیری، خدمات، مراقبت‌های عمومی دهان و دندان و نحوه‌ی استفاده از سامانه) کمک کن.',
  'تشخیص پزشکی نده و دارو تجویز نکن. برای درد شدید، تورم، خونریزی یا مشکل فوری، بیمار را به تماس با کلینیک یا مراجعه‌ی حضوری ارجاع بده.',
  'اگر چیزی را نمی‌دانی، نگو «می‌دانم»؛ پیشنهاد بده با پذیرش کلینیک تماس بگیرد.',
  'راهنمای نوبت: از بخش «ثبت نوبت» پزشک، خدمت، تاریخ و ساعت را انتخاب کنید؛ پس از تأیید، یادآور پیامکی ارسال می‌شود.'
].join('\n');

export interface AssistantProvider {
  readonly name: string;
  reply(messages: ChatMessage[]): Promise<string>;
}

/** No key needed: canned answers so the feature works out of the box. */
export class MockAssistantProvider implements AssistantProvider {
  readonly name = 'mock';

  async reply(messages: ChatMessage[]): Promise<string> {
    const last = messages.at(-1)?.content ?? '';
    if (/نوبت|رزرو/.test(last)) {
      return 'برای ثبت نوبت از بخش «ثبت نوبت» پزشک، خدمت، تاریخ و ساعت را انتخاب کنید. بعد از تأیید، یادآور پیامکی برایتان ارسال می‌شود.';
    }
    if (/درد|تورم|خونریزی|فوری/.test(last)) {
      return 'برای درد شدید، تورم یا خونریزی لطفاً هرچه زودتر با کلینیک تماس بگیرید یا حضوری مراجعه کنید.';
    }
    if (/ساعت|کاری|آدرس|تلفن/.test(last)) {
      return 'برای ساعت کاری، آدرس و شماره‌ی تماس کلینیک لطفاً با پذیرش هماهنگ کنید.';
    }
    return 'سلام! من «شاد»، دستیار کلینیک هستم. درباره‌ی نوبت‌گیری، خدمات و مراقبت‌های عمومی دهان و دندان می‌توانید از من بپرسید.';
  }
}

type FetchLike = typeof fetch;

/**
 * OpenRouter (openrouter.ai) — OpenAI-compatible chat completions. Models are
 * tried in order, so a rate-limited or unavailable free model falls through to the next one.
 */
export class OpenRouterAssistantProvider implements AssistantProvider {
  readonly name = 'openrouter';
  private readonly logger = new Logger('OpenRouterAssistant');

  constructor(
    private readonly apiKey: string,
    private readonly models: string[],
    private readonly baseUrl = 'https://openrouter.ai/api/v1',
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  async reply(messages: ChatMessage[]): Promise<string> {
    let lastError = 'no model configured';
    for (const model of this.models) {
      try {
        const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          signal: AbortSignal.timeout(25_000),
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'X-Title': 'Shad Clinic'
          },
          body: JSON.stringify({
            model,
            max_tokens: 400,
            temperature: 0.4,
            messages: [{ role: 'system', content: ASSISTANT_SYSTEM_PROMPT }, ...messages]
          })
        });
        if (!res.ok) {
          lastError = `${model}: HTTP ${res.status}`;
          this.logger.warn(`assistant request failed (${lastError})`);
          continue;
        }
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) return text;
        lastError = `${model}: empty reply`;
      } catch (err) {
        lastError = `${model}: ${err instanceof Error ? err.message : String(err)}`;
        this.logger.warn(`assistant request error (${lastError})`);
      }
    }
    throw new ServiceUnavailableException('دستیار در حال حاضر در دسترس نیست. لطفاً کمی بعد دوباره تلاش کنید.');
  }
}

/** Free-tier defaults; override with ASSISTANT_MODELS (comma separated) when a model is retired. */
export const DEFAULT_FREE_MODELS = ['openrouter/free'];

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  private readonly provider: AssistantProvider;

  constructor() {
    this.provider = AssistantService.resolveProvider(process.env, this.logger);
    this.logger.log(`Assistant provider: ${this.provider.name}`);
  }

  static resolveProvider(env: NodeJS.ProcessEnv, logger?: Logger): AssistantProvider {
    const name = env.ASSISTANT_PROVIDER ?? 'mock';
    if (name === 'openrouter') {
      const key = env.OPENROUTER_API_KEY?.trim();
      if (!key) {
        logger?.warn('ASSISTANT_PROVIDER=openrouter but OPENROUTER_API_KEY is missing; falling back to mock');
        return new MockAssistantProvider();
      }
      const models = (env.ASSISTANT_MODELS ?? '').split(',').map((m) => m.trim()).filter(Boolean);
      return new OpenRouterAssistantProvider(key, models.length ? models : DEFAULT_FREE_MODELS, env.OPENROUTER_BASE_URL || undefined);
    }
    if (name !== 'mock') logger?.warn(`Unknown ASSISTANT_PROVIDER "${name}", falling back to mock`);
    return new MockAssistantProvider();
  }

  chat(messages: ChatMessage[]) {
    return this.provider.reply(messages).then((reply) => ({ reply, provider: this.provider.name }));
  }
}
