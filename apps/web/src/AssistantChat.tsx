import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { PaperPlaneTilt, Robot, X } from '@phosphor-icons/react';
import { api } from './api';

type Msg = { role: 'user' | 'assistant'; content: string };

const GREETING: Msg = {
  role: 'assistant',
  content: 'سلام! من «شاد»، دستیار هوشمند کلینیک هستم. درباره‌ی نوبت‌گیری، خدمات و مراقبت‌های دهان و دندان بپرسید.'
};

/** Backend errors arrive as JSON text ({"message": "..."}); show just the message. */
function errorText(err: unknown) {
  const raw = err instanceof Error ? err.message : '';
  try {
    const msg = (JSON.parse(raw) as { message?: string | string[] }).message;
    if (msg) return Array.isArray(msg) ? msg.join('، ') : msg;
  } catch {
    /* not JSON */
  }
  return 'ارسال پیام ناموفق بود. لطفاً دوباره تلاش کنید.';
}

/** Floating chat bubble for signed-in users. Only the last 10 messages are sent to the API. */
export function AssistantChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, open, busy]);

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = text.trim();
    if (!content || busy) return;
    const next = [...messages, { role: 'user' as const, content }];
    setMessages(next);
    setText('');
    setError(null);
    setBusy(true);
    try {
      const history = next.slice(1).slice(-10); // drop the local greeting
      const res = (await api.assistantChat({ messages: history })) as { reply: string };
      setMessages([...next, { role: 'assistant', content: res.reply }]);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {open ? (
        <section className="assistantPanel" aria-label="دستیار هوشمند شاد">
          <header className="assistantHead">
            <strong><Robot weight="fill" /> دستیار شاد</strong>
            <button type="button" className="miniBtn" onClick={() => setOpen(false)} aria-label="بستن">
              <X />
            </button>
          </header>
          <div className="assistantBody">
            {messages.map((m, i) => (
              <p key={i} className={m.role === 'user' ? 'bubble me' : 'bubble bot'}>{m.content}</p>
            ))}
            {busy ? <p className="bubble bot">در حال نوشتن…</p> : null}
            {error ? <p className="bubble err">{error}</p> : null}
            <div ref={endRef} />
          </div>
          <form className="assistantForm" onSubmit={send}>
            <input
              value={text}
              maxLength={1000}
              placeholder="سؤالتان را بنویسید…"
              onChange={(e) => setText(e.target.value)}
            />
            <button className="actionBtn primary" type="submit" disabled={busy || !text.trim()} aria-label="ارسال">
              <PaperPlaneTilt weight="fill" />
            </button>
          </form>
          <small className="assistantNote">پاسخ‌ها جنبه‌ی راهنمایی دارند و جایگزین نظر پزشک نیستند.</small>
        </section>
      ) : null}
      <button type="button" className="assistantFab" onClick={() => setOpen((v) => !v)} aria-label="دستیار هوشمند">
        <Robot weight="fill" />
      </button>
    </>
  );
}
