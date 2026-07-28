import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck,
  Camera,
  CaretLeft,
  ChartLineUp,
  ChatCircleDots,
  CheckCircle,
  ClipboardText,
  Clock,
  CreditCard,
  Crown,
  CloudArrowUp,
  FloppyDisk,
  FolderOpen,
  House,
  List,
  Moon,
  Sparkle,
  Star,
  Storefront,
  Sun,
  Tooth,
  UserPlus,
  Users,
  Wallet,
  Wrench,
  X
} from '@phosphor-icons/react';
import DatePicker from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import { api, mediaUrl } from './api';
import type {
  Appointment,
  AuditEntry,
  DashboardSummary,
  Doctor,
  DoctorProfile,
  DoctorReview,
  FinanceReport,
  OrderInvoice,
  ServiceInvoice,
  Patient,
  Product,
  StaffDoctor,
  Ticket,
  TopPatient
} from './types';

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
/** Render any value with Persian digits (no-op on already-Persian text). */
const faNum = (value: string | number | null | undefined) =>
  String(value ?? '').replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);

const getFirstName = (name?: string) => name?.trim().split(' ')[0] || 'کاربر';

const STATUS_FA: Record<string, string> = {
  PENDING: 'در انتظار',
  APPROVED: 'تأیید شده',
  ATTENDED: 'انجام شده',
  CANCELLED: 'لغو شده',
  REJECTED: 'رد شده',
  ABSENT: 'غیبت',
  CONSULTATION_REQUESTED: 'درخواست مشاوره',
  OPEN: 'باز',
  CLOSED: 'بسته'
};

const METHOD_FA: Record<string, string> = {
  online: 'آنلاین',
  cash: 'نقدی',
  card: 'کارت‌خوان',
  wallet: 'کیف پول',
  insurance: 'بیمه'
};
const methodFa = (m: string) => METHOD_FA[m] ?? m;

const AUDIT_ACTION_FA: Record<string, string> = {
  'appointment.status': 'تغییر وضعیت نوبت',
  'doctor.update': 'به‌روزرسانی پزشک',
  'record.create': 'ثبت جلسه‌ی پرونده',
  'patient.create': 'ثبت بیمار جدید',
  'patient.update': 'ویرایش اطلاعات بیمار',
  'payment.verify': 'تأیید پرداخت'
};

const ROLE_FA: Record<string, string> = {
  ADMIN: 'مدیریت',
  RECEPTION: 'پذیرش',
  DOCTOR: 'پزشک',
  PATIENT: 'بیمار'
};

type SectionId =
  | 'overview'
  | 'appointments'
  | 'finance'
  | 'topPatients'
  | 'doctors'
  | 'patients'
  | 'products'
  | 'tickets'
  | 'audit'
  | 'settings'
  | 'reviews'
  | 'history'
  | 'deployment';
type AuthMode = 'patient-login' | 'patient-register' | 'staff-login' | 'patient-otp';
type AppUser = {
  id: string;
  role: string;
  phone: string;
  fullName: string;
  patient?: { id: string } | null;
  staffProfile?: { id: string; title?: string | null; specialty?: string | null } | null;
};

const sections: Array<{ id: SectionId; label: string; Icon: typeof House; staffOnly?: boolean }> = [
  { id: 'overview', label: 'داشبورد', Icon: House },
  { id: 'appointments', label: 'مدیریت نوبت‌ها', Icon: CalendarCheck, staffOnly: true },
  { id: 'finance', label: 'گزارش مالی', Icon: ChartLineUp, staffOnly: true },
  { id: 'topPatients', label: 'بیماران ویژه', Icon: Crown, staffOnly: true },
  { id: 'doctors', label: 'پزشکان', Icon: Tooth, staffOnly: true },
  { id: 'patients', label: 'بیماران', Icon: Users, staffOnly: true },
  { id: 'products', label: 'داروخانه', Icon: Storefront },
  { id: 'tickets', label: 'تیکت‌ها', Icon: ChatCircleDots, staffOnly: true },
  { id: 'audit', label: 'ممیزی', Icon: ClipboardText, staffOnly: true },
  { id: 'reviews', label: 'رضایت‌سنجی', Icon: Star, staffOnly: true },
  { id: 'history', label: 'تاریخچه خدمات', Icon: ClipboardText, staffOnly: true },
  { id: 'settings', label: 'تنظیمات حساب', Icon: Wrench, staffOnly: true }
];

const BRAND_TITLES = ['کلینیک دندانپزشکی شاد', 'بی‌معطلی، نوبت بگیر!'];

/** Brand title that cross-fades between two phrases, like the prototype. */
function RotatingTitle() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIndex((p) => (p + 1) % BRAND_TITLES.length), 6000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="brandRotator">
      {BRAND_TITLES.map((title, i) => (
        <span key={title} className={i === index ? 'brandPhrase show' : 'brandPhrase'}>
          {title}
        </span>
      ))}
    </div>
  );
}

/** Live Persian clock + date, like the prototype header. */
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="liveClock">
      <span>{faNum(now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }))}</span>
      <span className="clockDate">{faNum(now.toLocaleDateString('fa-IR'))}</span>
    </div>
  );
}

const BANNER_GRADIENTS = [
  'linear-gradient(135deg, #1e3a8a 0%, #020617 100%)',
  'linear-gradient(135deg, #0ea5e9 0%, #1e3a8a 100%)',
  'linear-gradient(135deg, #1e40af 0%, #0f172a 100%)'
];

type BannerSlide = { name: string; specialty: string };

/** Rotating doctor banner — gradient backgrounds (no external images). */
/** (#2) Illustrated banner artwork — brand-colored SVG, no external/stock photos needed. */
function BannerArt() {
  return (
    <svg className="bannerArt" viewBox="0 0 320 320" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="160" cy="160" r="150" fill="rgba(255,255,255,0.08)" />
      <circle cx="160" cy="160" r="108" fill="rgba(255,255,255,0.07)" />
      <path
        d="M160 78c-26-18-60-22-88-11-34 12-50 46-46 88 3 30 12 66 26 101 7 18 15 38 28 38 14 0 17-22 22-42 4-17 9-32 20-32s16 15 20 32c5 20 8 42 22 42 13 0 21-20 28-38 14-35 23-71 26-101 4-42-12-76-46-88-28-11-62-7-88 11z"
        fill="rgba(255,255,255,0.92)"
      />
      <path d="M118 150c6 14 6 30 2 44" stroke="#60a5fa" strokeWidth="4" strokeLinecap="round" opacity="0.55" />
      <path d="M202 150c-6 14-6 30-2 44" stroke="#60a5fa" strokeWidth="4" strokeLinecap="round" opacity="0.55" />
      <circle cx="238" cy="70" r="7" fill="#fff" opacity="0.8" />
      <circle cx="260" cy="96" r="4" fill="#fff" opacity="0.6" />
      <circle cx="70" cy="230" r="5" fill="#fff" opacity="0.6" />
    </svg>
  );
}

function BannerSlider({ slides, onBook }: { slides: BannerSlide[]; onBook: () => void }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(() => setIndex((p) => (p + 1) % slides.length), 6000);
    return () => clearInterval(timer);
  }, [slides.length]);
  if (slides.length === 0) return null;
  return (
    <div className="banner">
      {slides.map((slide, i) => (
        <div
          key={`${slide.name}-${i}`}
          className={i === index ? 'bannerSlide show' : 'bannerSlide'}
          style={{ background: BANNER_GRADIENTS[i % BANNER_GRADIENTS.length] }}
        >
          <div className="bannerGlow" />
          <BannerArt />
          <div className="bannerInner">
            <span className="heroBadge"><Tooth weight="fill" /> دندانپزشکی تخصصی شاد</span>
            <h3>{slide.name}</h3>
            <p>{slide.specialty}</p>
            <button className="actionBtn primary bannerBtn" onClick={onBook}>
              رزرو سریع ویزیت <CaretLeft weight="bold" />
            </button>
          </div>
        </div>
      ))}
      <div className="bannerDots">
        {slides.map((_, i) => (
          <button
            key={i}
            className={i === index ? 'dot active' : 'dot'}
            onClick={() => setIndex(i)}
            aria-label={`اسلاید ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

type ShortcutId = 'costs' | 'doctors' | 'insurance' | 'care';

const INSURANCE_PARTNERS = [
  'تأمین اجتماعی', 'بیمه سلامت ایرانیان', 'بیمه ایران', 'بیمه آسیا', 'بیمه دانا', 'بیمه پارسیان'
];

const CARE_TIPS = [
  { title: 'پس از جرم‌گیری', note: 'تا ۲۴ ساعت از خوردن غذاهای رنگی و داغ خودداری کنید.' },
  { title: 'پس از کشیدن دندان', note: 'محل را با گاز استریل فشار دهید و از مکیدن با نی پرهیز کنید.' },
  { title: 'پس از عصب‌کشی', note: 'تا ترمیم نهایی از جویدن با همان سمت خودداری کنید.' },
  { title: 'مراقبت روزانه', note: 'مسواک نرم، دو بار در روز، و نخ دندان روزانه را فراموش نکنید.' }
];

/**
 * (#4) Personalized care tips: match a patient's actual attended service
 * names against keyword groups. No schema change — purely derived from the
 * appointment.service strings already on the patient's record.
 */
const SERVICE_CARE_TIPS: Array<{ keywords: string[]; tips: Array<{ title: string; note: string }> }> = [
  {
    keywords: ['جرم', 'جرم‌گیری'],
    tips: [
      { title: 'پس از جرم‌گیری', note: 'تا ۲۴ ساعت از خوردن غذاهای رنگی، داغ یا خیلی سرد خودداری کنید.' },
      { title: 'حساسیت موقت', note: 'ممکن است چند روز حساسیت به سرما داشته باشید؛ طبیعی است.' }
    ]
  },
  {
    keywords: ['کشیدن', 'جراحی'],
    tips: [
      { title: 'پس از کشیدن دندان', note: 'محل را با گاز استریل حداقل نیم ساعت فشار دهید و از مکیدن با نی پرهیز کنید.' },
      { title: 'تغذیه', note: 'تا ۲۴ ساعت غذای نرم و ولرم مصرف کنید و از سمت مقابل بجوید.' }
    ]
  },
  {
    keywords: ['عصب', 'روت'],
    tips: [
      { title: 'پس از عصب‌کشی', note: 'تا ترمیم نهایی توسط پزشک، از جویدن با همان سمت خودداری کنید.' },
      { title: 'درد احتمالی', note: 'درد خفیف تا ۴۸ ساعت طبیعی است؛ در صورت تشدید با کلینیک تماس بگیرید.' }
    ]
  },
  {
    keywords: ['ارتودنسی', 'براکت', 'ثابت'],
    tips: [
      { title: 'مراقبت از براکت', note: 'از غذاهای سفت و چسبنده (آدامس، آجیل) خودداری کنید تا براکت آسیب نبیند.' },
      { title: 'بهداشت با ارتودنسی', note: 'با مسواک بین‌دندانی زیر سیم‌ها را تمیز کنید تا پلاک تجمع نکند.' }
    ]
  },
  {
    keywords: ['ایمپلنت'],
    tips: [
      { title: 'پس از ایمپلنت', note: 'تا زمان ترمیم استخوان از فشار مستقیم روی ناحیه خودداری کنید.' },
      { title: 'بهداشت ایمپلنت', note: 'با نخ دندان مخصوص ایمپلنت، اطراف آن را روزانه تمیز کنید.' }
    ]
  },
  {
    keywords: ['سفید', 'بلیچینگ', 'زیبایی'],
    tips: [
      { title: 'پس از سفیدکردن', note: 'تا ۴۸ ساعت از خوراکی‌های رنگی (چای، قهوه، رب) پرهیز کنید.' }
    ]
  },
  {
    keywords: ['ترمیم', 'کامپوزیت', 'پر کردن'],
    tips: [{ title: 'پس از ترمیم دندان', note: 'اگر از بی‌حسی استفاده شده، تا برطرف‌شدن کامل آن از جویدن خودداری کنید.' }]
  }
];

/** Returns personalized tips for the given service names, deduped, with a daily-care fallback. */
function careTipsForServices(services: string[]): Array<{ title: string; note: string }> {
  const matched = new Map<string, { title: string; note: string }>();
  for (const service of services) {
    for (const group of SERVICE_CARE_TIPS) {
      if (group.keywords.some((k) => service.includes(k))) {
        for (const tip of group.tips) matched.set(tip.title, tip);
      }
    }
  }
  if (matched.size === 0) {
    return [{ title: 'مراقبت روزانه', note: 'مسواک نرم، دو بار در روز، و نخ دندان روزانه را فراموش نکنید.' }];
  }
  return [...matched.values()];
}

const SHORTCUTS: Array<{ id: ShortcutId; Icon: typeof House; title: string; note: string }> = [
  { id: 'costs', Icon: Wallet, title: 'هزینه‌ها', note: 'تعرفه خدمات' },
  { id: 'doctors', Icon: Star, title: 'لیست پزشکان', note: 'تیم درمانی' },
  { id: 'insurance', Icon: Sparkle, title: 'طرف‌قرارداد بیمه‌ها', note: 'پوشش بیمه‌ای' },
  { id: 'care', Icon: Wrench, title: 'مراقبت‌ها', note: 'نکات پس از درمان' }
];

function FeatureCards({ onOpen }: { onOpen: (id: ShortcutId) => void }) {
  return (
    <section className="featuresBlock">
      <div className="featuresHead"><span>دسترسی سریع</span></div>
      <div className="featureGrid">
        {SHORTCUTS.map((f) => (
          <article key={f.id} className="featureCard" role="button" tabIndex={0} onClick={() => onOpen(f.id)}>
            <div className="featureIcon"><f.Icon weight="fill" /></div>
            <strong>{f.title}</strong>
            <span>{f.note}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

const PORTAL_FILTERS = [
  { id: 'all', label: 'همه' },
  { id: 'pending', label: 'در انتظار' },
  { id: 'approved', label: 'تأیید شده' }
] as const;

/** Logged-in patient's personal dashboard (matches the prototype portal). */
function PatientPortal({
  patient,
  userName,
  onBook,
  onSubmitReview
}: {
  patient: Patient | null;
  userName: string;
  onBook: () => void;
  onSubmitReview: (appointmentId: string, rating: number, reviewText: string) => Promise<void>;
}) {
  const [filter, setFilter] = useState<(typeof PORTAL_FILTERS)[number]['id']>('all');
  const [showRecords, setShowRecords] = useState(false);
  const [reviewOpenId, setReviewOpenId] = useState<string | null>(null);
  const [reviewDraft, setReviewDraft] = useState({ rating: 5, text: '' });
  const records = patient?.medicalRecords ?? [];
  const appointments = patient?.appointments ?? [];
  const active = appointments.filter((a) => a.status === 'PENDING' || a.status === 'APPROVED').length;
  const attended = appointments.filter((a) => a.status === 'ATTENDED').length;
  const nextAppt = appointments.find((a) => a.status === 'PENDING' || a.status === 'APPROVED') ?? null;
  const filtered = appointments.filter((a) =>
    filter === 'all' ? true : filter === 'pending' ? a.status === 'PENDING' : a.status === 'APPROVED'
  );
  const personalCareTips = careTipsForServices(appointments.filter((a) => a.status === 'ATTENDED').map((a) => a.service));

  return (
    <>
      <section className="portalTop">
        <div className="panel welcomeCard">
          <div className="welcomeAvatar"><Users weight="fill" /></div>
          <div className="welcomeText">
            <h2>{getFirstName(userName)} عزیز</h2>
            <p>به پورتال اختصاصی بیماران کلینیک شاد خوش آمدید.</p>
          </div>
          <button className="actionBtn primary welcomeBtn" onClick={() => setShowRecords((s) => !s)}>
            <FolderOpen weight="fill" /> {showRecords ? 'بستن پرونده' : 'مشاهده کامل پرونده پزشکی'}
          </button>
        </div>
        <div className="panel walletCard">
          <span className="walletLabel"><Wallet weight="fill" /> اعتبار کیف پول</span>
          <strong>{faNum((patient?.wallet ?? 0).toLocaleString('fa-IR'))} تومان</strong>
        </div>
      </section>

      <section className={nextAppt ? 'panel nextApptCard' : 'panel nextApptCard empty'}>
        {nextAppt ? (
          <>
            <div className="nextApptInfo">
              <span className="nextApptLabel"><CalendarCheck weight="fill" /> نوبت بعدی شما</span>
              <strong>{nextAppt.service}</strong>
              <p>{faNum(nextAppt.date)} — ساعت {faNum(nextAppt.time)}</p>
              <span className={`status ${nextAppt.status.toLowerCase()}`}>{STATUS_FA[nextAppt.status] ?? nextAppt.status}</span>
            </div>
            <button className="actionBtn primary" onClick={onBook}>
              <CalendarCheck weight="fill" /> رزرو نوبت جدید
            </button>
          </>
        ) : (
          <>
            <div className="nextApptInfo">
              <span className="nextApptLabel"><CalendarCheck weight="fill" /> نوبت فعالی ندارید</span>
              <p>برای دریافت خدمات، اولین نوبت خود را رزرو کنید.</p>
            </div>
            <button className="actionBtn primary" onClick={onBook}>
              <CalendarCheck weight="fill" /> رزرو نوبت
            </button>
          </>
        )}
      </section>

      {showRecords ? (
        <section className="panel">
          <div className="panelHeader">
            <h2>پرونده پزشکی</h2>
            <span>{faNum(records.length)} جلسه</span>
          </div>
          {records.length === 0 ? (
            <div className="emptyState"><FolderOpen /><p>هنوز جلسه‌ای ثبت نشده است.</p></div>
          ) : (
            <div className="stack">
              {records.map((record) => (
                <article key={record.id} className="recordCard">
                  <div className="panelHeader">
                    <strong>{record.title}</strong>
                    <span>{faNum(new Date(record.createdAt).toLocaleDateString('fa-IR'))}</span>
                  </div>
                  <p>{record.note}</p>
                  {record.createdByUser ? <small className="recordActor">ثبت‌شده توسط {record.createdByUser.fullName}</small> : null}
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section className="statsGrid portalStats">
        <article className="panel stat"><span>کل مراجعات</span><strong>{faNum(appointments.length)}</strong></article>
        <article className="panel stat"><span>نوبت‌های فعال</span><strong>{faNum(active)}</strong></article>
        <article className="panel stat"><span>جلسات انجام‌شده</span><strong>{faNum(attended)}</strong></article>
      </section>

      <section className="panel">
        <div className="panelHeader">
          <h2>مدیریت نوبت‌ها</h2>
          <div className="segmented portalFilter">
            {PORTAL_FILTERS.map((f) => (
              <button
                key={f.id}
                className={filter === f.id ? 'segment active' : 'segment'}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="emptyState">
            <CalendarCheck />
            <p>نوبتی یافت نشد.</p>
            <button className="actionBtn primary" onClick={onBook}>رزرو نوبت جدید</button>
          </div>
        ) : (
          <div className="stack">
            {filtered.map((a) => (
              <div key={a.id} className="apptRow">
                <div className="tableRow">
                  <div><strong>{a.service}</strong></div>
                  <div><strong>{faNum(a.date)}</strong><p>{faNum(a.time)}</p></div>
                  <div className={`status ${a.status.toLowerCase()}`}>{STATUS_FA[a.status] ?? a.status}</div>
                  {a.status === 'ATTENDED' ? (
                    a.reviewed ? (
                      <span className="patientBadge">✓ رضایت ثبت شد</span>
                    ) : (
                      <button
                        className="miniBtn"
                        onClick={() => {
                          setReviewOpenId(reviewOpenId === a.id ? null : a.id);
                          setReviewDraft({ rating: 5, text: '' });
                        }}
                      >
                        ثبت رضایت از پزشک
                      </button>
                    )
                  ) : null}
                </div>
                {reviewOpenId === a.id ? (
                  <div className="reviewForm">
                    <div className="starPicker">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          aria-label={`${n} ستاره`}
                          onClick={() => setReviewDraft({ ...reviewDraft, rating: n })}
                        >
                          <Star weight={n <= reviewDraft.rating ? 'fill' : 'regular'} />
                        </button>
                      ))}
                    </div>
                    <textarea
                      placeholder="نظر شما درباره‌ی این ویزیت (اختیاری)…"
                      rows={2}
                      value={reviewDraft.text}
                      onChange={(e) => setReviewDraft({ ...reviewDraft, text: e.target.value })}
                    />
                    <button
                      className="actionBtn primary"
                      onClick={async () => {
                        await onSubmitReview(a.id, reviewDraft.rating, reviewDraft.text);
                        setReviewOpenId(null);
                      }}
                    >
                      ثبت نظر
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel careTipsPanel">
        <div className="panelHeader"><h2>توصیه‌های پزشکی برای شما</h2></div>
        <p className="formHint">بر اساس خدماتی که تاکنون در کلینیک دریافت کرده‌اید.</p>
        <div className="grid2">
          {personalCareTips.map((tip) => (
            <article key={tip.title} className="careTipCard">
              <strong>{tip.title}</strong>
              <p>{tip.note}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

const staffRoles = [
  { label: 'مدیریت', value: 'ADMIN' },
  { label: 'پذیرش', value: 'RECEPTION' },
  { label: 'پزشک', value: 'DOCTOR' }
] as const;

const blankPatientAuth = {
  fullName: '',
  phone: '',
  nationalId: '',
  insurance: '',
  password: ''
};

const blankStaffAuth = {
  phone: '',
  password: '',
  role: 'ADMIN'
};

const blankBooking = {
  doctorId: '',
  service: 'ارتودنسی',
  date: '',
  time: ''
};

const blankRecord = {
  title: '',
  note: ''
};

export function App() {
  const [active, setActive] = useState<SectionId>('overview');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientDetail, setPatientDetail] = useState<Patient | null>(null);
  const [recordDraft, setRecordDraft] = useState(blankRecord);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('patient-login');
  const [patientAuth, setPatientAuth] = useState(blankPatientAuth);
  const [staffAuth, setStaffAuth] = useState(blankStaffAuth);
  const [otpNationalId, setOtpNationalId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [booking, setBooking] = useState(blankBooking);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (localStorage.getItem('shad_theme') as 'light' | 'dark') || 'light'
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [myPatient, setMyPatient] = useState<Patient | null>(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [recordImages, setRecordImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [staffDoctorsList, setStaffDoctorsList] = useState<StaffDoctor[]>([]);
  const [topPatientsList, setTopPatientsList] = useState<TopPatient[]>([]);
  const [finance, setFinance] = useState<FinanceReport | null>(null);
  const [auditList, setAuditList] = useState<AuditEntry[]>([]);
  const [doctorService, setDoctorService] = useState<string>('all');
  const [cart, setCart] = useState<Array<{ productId: string; name: string; price: number; qty: number }>>([]);
  const [invoice, setInvoice] = useState<OrderInvoice | null>(null);
  const [shortcutOpen, setShortcutOpen] = useState<ShortcutId | null>(null);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '' });
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [staffUsersList, setStaffUsersList] = useState<Array<{ id: string; fullName: string; phone: string; role: string }>>([]);
  const [resetTarget, setResetTarget] = useState('');
  const [resetPw, setResetPw] = useState('');
  const [reviewsList, setReviewsList] = useState<DoctorReview[]>([]);
  const [payFormOpenId, setPayFormOpenId] = useState<string | null>(null);
  const [payDraft, setPayDraft] = useState({ amount: '', method: 'cash' });
  const [serviceInvoice, setServiceInvoice] = useState<ServiceInvoice | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [historyFrom, setHistoryFrom] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [historyTo, setHistoryTo] = useState<any>(null);
  const [historyList, setHistoryList] = useState<Appointment[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [doctorProfileData, setDoctorProfileData] = useState<DoctorProfile | null>(null);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [profileBioDraft, setProfileBioDraft] = useState('');
  const [profileUploading, setProfileUploading] = useState(false);
  const [apptFilter, setApptFilter] = useState<'all' | 'PENDING' | 'APPROVED' | 'ATTENDED'>('all');
  const [apptSearch, setApptSearch] = useState('');
  const [newPatientOpen, setNewPatientOpen] = useState(false);
  const [newPatient, setNewPatient] = useState({ fullName: '', phone: '', nationalId: '', insurance: '' });

  useEffect(() => {
    document.body.classList.toggle('theme-dark', theme === 'dark');
    document.body.classList.toggle('theme-light', theme === 'light');
    localStorage.setItem('shad_theme', theme);
  }, [theme]);

  // Handle the return from a real payment gateway (e.g. Zarinpal redirects to
  // PAYMENT_CALLBACK_URL?authority=...): verify, then show the invoice.
  useEffect(() => {
    const authority = new URLSearchParams(window.location.search).get('authority');
    if (!authority) return;
    window.history.replaceState({}, '', window.location.pathname);
    api.verifyPayment({ authority })
      .then((r) => {
        const res = r as { ok: boolean; orderId?: string };
        if (res.ok && res.orderId) {
          return api.invoice(res.orderId).then((inv) => setInvoice(inv as OrderInvoice));
        }
        return undefined;
      })
      .catch(() => undefined);
  }, []);

  const loadData = async () => {
    // Endpoints are role-guarded: guests/patients only see public data (doctors,
    // products). allSettled keeps the page working instead of failing on 401s.
    const [sum, appts, pats, docs, prods, tix] = await Promise.allSettled([
      api.dashboard(),
      api.appointments(),
      api.patients(),
      api.doctors(),
      api.products(),
      api.tickets()
    ]);
    if (sum.status === 'fulfilled') setSummary(sum.value as DashboardSummary);
    if (appts.status === 'fulfilled') setAppointments(appts.value as Appointment[]);
    if (pats.status === 'fulfilled') {
      setPatients(pats.value as Patient[]);
      setSelectedPatient((pats.value as Patient[])[0] ?? null);
    }
    if (docs.status === 'fulfilled') setDoctors(docs.value as Doctor[]);
    if (prods.status === 'fulfilled') setProducts(prods.value as Product[]);
    if (tix.status === 'fulfilled') setTickets(tix.value as Ticket[]);
  };

  useEffect(() => {
    const token = localStorage.getItem('shad_token');
    const rawUser = localStorage.getItem('shad_user');
    if (token && rawUser) {
      try {
        setCurrentUser(JSON.parse(rawUser) as AppUser);
      } catch {
        localStorage.removeItem('shad_token');
        localStorage.removeItem('shad_user');
      }
    }
    loadData()
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false));
  }, []);

  const activePatient = selectedPatient ?? patients[0] ?? null;
  const activePatientDetail = patientDetail ?? activePatient;
  const canBook = currentUser?.role === 'PATIENT' && currentUser.patient?.id;
  const canModerate = currentUser?.role === 'ADMIN' || currentUser?.role === 'RECEPTION' || currentUser?.role === 'DOCTOR';
  const visibleSections = sections.filter((section) => !section.staffOnly || canModerate);

  useEffect(() => {
    if (!visibleSections.some((section) => section.id === active)) {
      setActive('overview');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // Operational metrics (status-based — reliable regardless of date format).
  const pendingCount = appointments.filter((a) => a.status === 'PENDING').length;
  const activeApptCount = appointments.filter(
    (a) => a.status === 'PENDING' || a.status === 'APPROVED'
  ).length;
  const openTicketsCount = tickets.filter((t) => t.status !== 'RESOLVED').length;
  // Agenda: pending appointments first, then the rest; capped for the dashboard.
  const agendaAppointments = useMemo(
    () =>
      [...appointments]
        .sort((a, b) => Number(b.status === 'PENDING') - Number(a.status === 'PENDING'))
        .slice(0, 8),
    [appointments]
  );

  const bannerSlides = useMemo<BannerSlide[]>(() => {
    const fromApi = doctors.slice(0, 3).map((doctor) => ({
      name: doctor.user.fullName,
      specialty: doctor.specialty ?? doctor.service ?? doctor.title ?? 'دندانپزشک'
    }));
    if (fromApi.length > 0) return fromApi;
    return [
      { name: 'دکتر داریوش جوهری', specialty: 'متخصص جراحی لثه' },
      { name: 'دکتر شعله شاهی', specialty: 'متخصص ارتودنسی' },
      { name: 'دکتر الهه فلسفی‌زاده', specialty: 'دندان‌پزشکی عمومی' }
    ];
  }, [doctors]);

  useEffect(() => {
    if (currentUser?.role === 'PATIENT' && currentUser.patient?.id) {
      api.patient(currentUser.patient.id)
        .then((data) => setMyPatient(data as Patient))
        .catch(() => undefined);
    } else {
      setMyPatient(null);
    }
  }, [currentUser, appointments]);

  useEffect(() => {
    if (!selectedPatient) return;
    api.patient(selectedPatient.id)
      .then((data) => setPatientDetail(data as Patient))
      .catch((err) => setError(err.message));
  }, [selectedPatient]);

  const reload = async () => {
    try {
      await loadData();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطای نامشخص');
    }
  };

  useEffect(() => {
    if (active === 'doctors') {
      api.staffDoctors().then((d) => setStaffDoctorsList(d as StaffDoctor[])).catch(() => undefined);
    } else if (active === 'topPatients') {
      api.topPatients().then((d) => setTopPatientsList(d as TopPatient[])).catch(() => undefined);
    } else if (active === 'finance') {
      api.financeReport().then((d) => setFinance(d as FinanceReport)).catch(() => undefined);
    } else if (active === 'audit') {
      api.audit().then((d) => setAuditList(d as AuditEntry[])).catch(() => undefined);
    } else if (active === 'settings' && currentUser?.role === 'ADMIN') {
      api.staffUsers().then((d) => setStaffUsersList(d as typeof staffUsersList)).catch(() => undefined);
    } else if (active === 'reviews') {
      api.reviews().then((d) => setReviewsList(d as DoctorReview[])).catch(() => undefined);
    }
  }, [active]);

  const patchDoctor = async (id: string, data: Record<string, unknown>) => {
    try {
      await api.updateDoctor(id, data);
      const list = await api.staffDoctors();
      setStaffDoctorsList(list as StaffDoctor[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'به‌روزرسانی پزشک ناموفق بود');
    }
  };

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPwMsg(null);
    try {
      setBusy(true);
      await api.changePassword(pwForm);
      setPwForm({ currentPassword: '', newPassword: '' });
      setPwMsg('رمز عبور با موفقیت تغییر کرد.');
    } catch (err) {
      setPwMsg(err instanceof Error ? err.message : 'تغییر رمز عبور ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  const handleAdminReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resetTarget || !resetPw) return;
    setPwMsg(null);
    try {
      setBusy(true);
      await api.adminResetPassword({ userId: resetTarget, newPassword: resetPw });
      setResetPw('');
      setPwMsg('رمز عبور کاربر بازنشانی شد.');
    } catch (err) {
      setPwMsg(err instanceof Error ? err.message : 'بازنشانی رمز عبور ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitReview = async (appointmentId: string, rating: number, reviewText: string) => {
    try {
      await api.submitReview(appointmentId, { rating, reviewText });
      if (currentUser?.patient?.id) {
        const refreshed = await api.patient(currentUser.patient.id);
        setMyPatient(refreshed as Patient);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ثبت رضایت ناموفق بود');
    }
  };

  const handlePayForService = async (appointmentId: string) => {
    const amount = Number(payDraft.amount);
    if (!amount || amount <= 0) {
      setError('مبلغ فاکتور نامعتبر است.');
      return;
    }
    try {
      setBusy(true);
      await api.payForService(appointmentId, { amount, method: payDraft.method });
      const invoice = await api.serviceInvoice(appointmentId);
      setServiceInvoice(invoice as ServiceInvoice);
      setPayFormOpenId(null);
      setPayDraft({ amount: '', method: 'cash' });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'صدور فاکتور ناموفق بود');
    } finally {
      setBusy(false);
    }
  };

  const handleSearchHistory = async () => {
    try {
      setBusy(true);
      const fromIso = historyFrom ? historyFrom.toDate().toISOString() : new Date(0).toISOString();
      const toIso = historyTo ? historyTo.toDate().toISOString() : new Date().toISOString();
      const list = await api.serviceHistory(fromIso, toIso);
      setHistoryList(list as Appointment[]);
      setHistoryLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'دریافت تاریخچه ناموفق بود');
    } finally {
      setBusy(false);
    }
  };

  const openDoctorProfile = async (doctorId: string) => {
    try {
      const profile = await api.doctorProfile(doctorId);
      setDoctorProfileData(profile as DoctorProfile);
      setProfileBioDraft((profile as DoctorProfile).bio ?? '');
      setProfileEditOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'دریافت پروفایل پزشک ناموفق بود');
    }
  };

  const handleSaveDoctorProfile = async () => {
    if (!doctorProfileData) return;
    try {
      await api.updateDoctor(doctorProfileData.id, { bio: profileBioDraft });
      await openDoctorProfile(doctorProfileData.id);
      const list = await api.staffDoctors();
      setStaffDoctorsList(list as StaffDoctor[]);
      setProfileEditOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ذخیره‌ی پروفایل ناموفق بود');
    }
  };

  const handleDoctorPhotoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !doctorProfileData) return;
    try {
      setProfileUploading(true);
      const uploaded = await api.uploadFile(file);
      await api.updateDoctor(doctorProfileData.id, { imageUrl: uploaded.url });
      await openDoctorProfile(doctorProfileData.id);
      const list = await api.staffDoctors();
      setStaffDoctorsList(list as StaffDoctor[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'آپلود عکس پزشک ناموفق بود');
    } finally {
      setProfileUploading(false);
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const found = prev.find((i) => i.productId === product.id);
      if (found) {
        return prev.map((i) => (i.productId === product.id ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...prev, { productId: product.id, name: product.name, price: product.price, qty: 1 }];
    });
  };

  const removeFromCart = (productId: string) =>
    setCart((prev) => prev.filter((i) => i.productId !== productId));

  const handleCheckout = async () => {
    if (!currentUser?.patient?.id || cart.length === 0) return;
    try {
      setBusy(true);
      const order = (await api.createOrder({
        patientId: currentUser.patient.id,
        items: cart.map((i) => ({ productId: i.productId, qty: i.qty }))
      })) as { id: string };
      const pay = (await api.requestPayment({ orderId: order.id })) as {
        provider: string;
        authority: string;
        url: string;
      };
      if (pay.provider === 'mock') {
        const result = (await api.verifyPayment({ authority: pay.authority })) as { ok: boolean };
        if (!result.ok) {
          setError('پرداخت ناموفق بود.');
          return;
        }
        setInvoice((await api.invoice(order.id)) as OrderInvoice);
        setCart([]);
        await reload();
      } else {
        window.location.href = pay.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'پرداخت ناموفق بود');
    } finally {
      setBusy(false);
    }
  };

  const applyAuthSuccess = async (result: unknown) => {
    const token = (result as { accessToken: string }).accessToken;
    const user = (result as { user: AppUser }).user;
    localStorage.setItem('shad_token', token);
    localStorage.setItem('shad_user', JSON.stringify(user));
    setCurrentUser(user);
    setAuthOpen(false);
    setError(null);
    await reload();
  };

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setBusy(true);
      const result =
        authMode === 'patient-login'
          ? await api.authPatientLogin(patientAuth)
          : authMode === 'patient-register'
            ? await api.authPatientRegister(patientAuth)
            : await api.authStaffLogin(staffAuth);
      await applyAuthSuccess(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ورود ناموفق');
    } finally {
      setBusy(false);
    }
  };

  const handleRequestOtp = async () => {
    if (!otpNationalId.trim()) return;
    try {
      setBusy(true);
      await api.requestOtp({ nationalId: otpNationalId });
      setOtpSent(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ارسال کد ناموفق بود');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setBusy(true);
      const result = await api.verifyOtp({ nationalId: otpNationalId, code: otpCode });
      await applyAuthSuccess(result);
      setOtpNationalId('');
      setOtpCode('');
      setOtpSent(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'کد وارد شده نامعتبر است');
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('shad_token');
    localStorage.removeItem('shad_user');
    setCurrentUser(null);
  };

  const handleBookingSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentUser?.patient?.id) {
      setError('برای ثبت نوبت باید با حساب بیمار وارد شوید.');
      return;
    }
    try {
      setBusy(true);
      await api.createAppointment({
        patientId: currentUser.patient.id,
        doctorId: booking.doctorId || undefined,
        service: booking.service,
        date: booking.date,
        time: booking.time
      });
      setBookingOpen(false);
      setBooking(blankBooking);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ثبت نوبت ناموفق بود');
    } finally {
      setBusy(false);
    }
  };

  const handleRecordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activePatientDetail || !currentUser?.id) {
      setError('برای ثبت پرونده باید بیمار و کاربر جاری مشخص باشند.');
      return;
    }
    try {
      setBusy(true);
      await api.createRecord({
        patientId: activePatientDetail.id,
        title: recordDraft.title,
        note: recordDraft.note,
        images: recordImages,
        createdByUserId: currentUser.id
      });
      setRecordDraft(blankRecord);
      setRecordImages([]);
      const refreshed = await api.patient(activePatientDetail.id);
      setPatientDetail(refreshed as Patient);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ثبت پرونده ناموفق بود');
    } finally {
      setBusy(false);
    }
  };

  const handleRecordUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    try {
      setUploading(true);
      const uploaded = await Promise.all(files.map((file) => api.uploadFile(file)));
      setRecordImages((prev) => [...prev, ...uploaded.map((u) => u.url)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'آپلود تصویر ناموفق بود');
    } finally {
      setUploading(false);
    }
  };

  const handleCreatePatient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newPatient.fullName.trim() || !newPatient.phone.trim()) {
      setError('نام و شماره موبایل الزامی است.');
      return;
    }
    try {
      setBusy(true);
      await api.createPatient(newPatient);
      setNewPatient({ fullName: '', phone: '', nationalId: '', insurance: '' });
      setNewPatientOpen(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ثبت بیمار ناموفق بود');
    } finally {
      setBusy(false);
    }
  };

  const updateAppointment = async (id: string, status: 'APPROVED' | 'CANCELLED' | 'REJECTED' | 'ATTENDED') => {
    try {
      setBusy(true);
      await api.updateAppointmentStatus(id, { status });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'به‌روزرسانی نوبت ناموفق بود');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <header className="appHeader">
        <div className="headerCluster start">
          {currentUser ? (
            <div className="accountMenu">
              <button
                className="avatarBtn"
                aria-haspopup="menu"
                aria-expanded={accountOpen}
                onClick={() => setAccountOpen((o) => !o)}
              >
                <span className="avatarCircle">{getFirstName(currentUser.fullName).charAt(0)}</span>
                <span className="avatarName">{getFirstName(currentUser.fullName)}</span>
              </button>
              {accountOpen ? (
                <>
                  <div className="accountBackdrop" onClick={() => setAccountOpen(false)} />
                  <div className="accountDropdown" role="menu">
                    <div className="accountHead">
                      <span className="avatarCircle lg">{getFirstName(currentUser.fullName).charAt(0)}</span>
                      <div>
                        <strong>{currentUser.fullName}</strong>
                        <span>{faNum(currentUser.phone)}</span>
                      </div>
                      <span className="roleBadge">{ROLE_FA[currentUser.role] ?? currentUser.role}</span>
                    </div>
                    {canBook ? (
                      <button
                        className="accountItem"
                        onClick={() => {
                          setBookingOpen(true);
                          setAccountOpen(false);
                        }}
                      >
                        <CalendarCheck weight="fill" /> ثبت نوبت جدید
                      </button>
                    ) : null}
                    <button
                      className="accountItem danger"
                      onClick={() => {
                        handleLogout();
                        setAccountOpen(false);
                      }}
                    >
                      <X weight="bold" /> خروج از حساب
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <button className="actionBtn primary" onClick={() => setAuthOpen(true)}>ورود و ثبت‌نام</button>
          )}
        </div>
        <div className="headerBrand">
          <span className="brandMark"><Tooth weight="fill" /></span>
          <RotatingTitle />
        </div>
        <div className="headerCluster end">
          <LiveClock />
          <button
            className="iconBtn"
            aria-label="تغییر تم"
            title={theme === 'light' ? 'حالت تیره' : 'حالت روشن'}
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          >
            {theme === 'light' ? <Moon weight="fill" /> : <Sun weight="fill" />}
          </button>
          <button className="iconBtn hamburger" aria-label="منو" onClick={() => setMenuOpen(true)}>
            <List weight="bold" />
          </button>
        </div>
      </header>

      <nav className="pillNav" aria-label="ناوبری">
        {visibleSections.map((section) => (
          <button
            key={section.id}
            className={section.id === active ? 'pill active' : 'pill'}
            onClick={() => setActive(section.id)}
          >
            <section.Icon weight={section.id === active ? 'fill' : 'regular'} />
            <span>{section.label}</span>
          </button>
        ))}
        {canBook ? (
          <button className="pill pillPrimary" onClick={() => setBookingOpen(true)}>
            <CalendarCheck weight="fill" /> ثبت نوبت
          </button>
        ) : null}
      </nav>

      <main className="content">
        {error ? <div className="errorBox">{error}</div> : null}
        {busy ? <div className="loadingBar"><span className="spinner" /> در حال بارگذاری…</div> : null}

        {active === 'overview' ? (
          canModerate ? (
            <>
              <section className="dashboardHeader">
                <div className="dashboardWelcome">
                  <h1>خوش آمدید، {currentUser?.fullName}</h1>
                  <p>خلاصه‌ی عملیاتی کلینیک — آنچه نیاز به توجه دارد</p>
                </div>
              </section>

              <section className="statsGrid">
                <button className="panel stat statAction" onClick={() => setActive('appointments')}>
                  <span>در انتظار تأیید</span>
                  <strong className={pendingCount > 0 ? 'accentWarn' : ''}>{faNum(pendingCount)}</strong>
                  <small>نیازمند بررسی</small>
                </button>
                <button className="panel stat statAction" onClick={() => setActive('appointments')}>
                  <span>نوبت‌های فعال</span>
                  <strong>{faNum(activeApptCount)}</strong>
                  <small>در انتظار + تأییدشده</small>
                </button>
                <button className="panel stat statAction" onClick={() => setActive('patients')}>
                  <span>بیماران</span>
                  <strong>{faNum(patients.length)}</strong>
                  <small>کل پرونده‌ها</small>
                </button>
                <button className="panel stat statAction" onClick={() => setActive('tickets')}>
                  <span>تیکت‌های باز</span>
                  <strong className={openTicketsCount > 0 ? 'accentWarn' : ''}>{faNum(openTicketsCount)}</strong>
                  <small>پاسخ داده‌نشده</small>
                </button>
              </section>

              <section className="panel">
                <div className="panelHeader">
                  <h2>نوبت‌های پیش‌رو</h2>
                  <button className="miniBtn" onClick={() => setActive('appointments')}>مشاهده همه</button>
                </div>
                {agendaAppointments.length === 0 ? (
                  <div className="emptyState"><CalendarCheck /><p>نوبتی ثبت نشده است.</p></div>
                ) : (
                  <div className="table">
                    {agendaAppointments.map((appointment) => (
                      <div className="tableRow" key={appointment.id}>
                        <div>
                          <strong>{appointment.patient.user.fullName}</strong>
                          <p>{appointment.service}{appointment.doctor ? ` · ${appointment.doctor.specialty ?? appointment.doctor.title}` : ''}</p>
                        </div>
                        <div><strong>{faNum(appointment.date)}</strong><p>{faNum(appointment.time)}</p></div>
                        <div className={`status ${appointment.status.toLowerCase()}`}>{STATUS_FA[appointment.status] ?? appointment.status}</div>
                        <div className="rowActions">
                          {appointment.status === 'PENDING' ? (
                            <button className="miniBtn" onClick={() => updateAppointment(appointment.id, 'APPROVED')}>تأیید</button>
                          ) : null}
                          <button className="miniBtn" onClick={() => updateAppointment(appointment.id, 'ATTENDED')}>انجام شد</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : currentUser?.role === 'PATIENT' ? (
            <PatientPortal
              patient={myPatient}
              userName={currentUser.fullName}
              onBook={() => (canBook ? setBookingOpen(true) : setAuthOpen(true))}
              onSubmitReview={handleSubmitReview}
            />
          ) : (
            <>
              <BannerSlider
                slides={bannerSlides}
                onBook={() => setAuthOpen(true)}
              />

              <FeatureCards onOpen={setShortcutOpen} />

              <section className="cta">
                <div className="ctaGlow" />
                <div className="ctaInner">
                  <h2>لبخندی که شایسته شماست</h2>
                  <p>
                    سلامت دهان و دندان خود را به تیمی متخصص بسپارید. با سیستم رزرو هوشمند کلینیک شاد،
                    ویزیت خود را بدون اتلاف وقت ثبت کنید.
                  </p>
                  <button
                    className="actionBtn primary"
                    onClick={() => setAuthOpen(true)}
                  >
                    <CalendarCheck weight="fill" /> همین الان ویزیت بگیر
                  </button>
                </div>
              </section>
            </>
          )
        ) : null}

        {active === 'appointments' ? (
          (() => {
            const apptFilters = [
              { id: 'all', label: 'همه' },
              { id: 'PENDING', label: 'در انتظار' },
              { id: 'APPROVED', label: 'تأیید شده' },
              { id: 'ATTENDED', label: 'انجام‌شده' }
            ] as const;
            const q = apptSearch.trim();
            const visibleAppts = appointments.filter((a) => {
              if (apptFilter !== 'all' && a.status !== apptFilter) return false;
              if (!q) return true;
              return (
                a.patient.user.fullName.includes(q) ||
                a.patient.user.phone.includes(q) ||
                a.service.includes(q)
              );
            });
            return (
              <section className="panel">
                <div className="panelHeader">
                  <h2>نوبت‌ها</h2>
                  <span>{faNum(visibleAppts.length)} از {faNum(appointments.length)}</span>
                </div>
                <div className="segmented apptFilter">
                  {apptFilters.map((f) => (
                    <button
                      key={f.id}
                      className={apptFilter === f.id ? 'segment active' : 'segment'}
                      onClick={() => setApptFilter(f.id)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <input
                  className="searchInput"
                  placeholder="جستجو بر اساس نام، شماره یا خدمت…"
                  value={apptSearch}
                  onChange={(e) => setApptSearch(e.target.value)}
                />
                {visibleAppts.length === 0 ? (
                  <div className="emptyState"><CalendarCheck /><p>نوبتی با این فیلتر یافت نشد.</p></div>
                ) : (
                  <div className="table">
                    {visibleAppts.map((appointment) => (
                      <div className="apptRow" key={appointment.id}>
                        <div className="tableRow">
                          <div>
                            <strong>{appointment.patient.user.fullName}</strong>
                            <p>{faNum(appointment.patient.user.phone)}</p>
                          </div>
                          <div>
                            <strong>{appointment.service}</strong>
                            <p>{appointment.doctor ? (appointment.doctor.specialty ?? appointment.doctor.title) : 'پزشک تعیین‌نشده'}</p>
                          </div>
                          <div>
                            <strong>{faNum(appointment.date)}</strong>
                            <p>{faNum(appointment.time)}</p>
                          </div>
                          <div className={`status ${appointment.status.toLowerCase()}`}>{STATUS_FA[appointment.status] ?? appointment.status}</div>
                          {appointment.handledBy ? (
                            <span className="patientBadge" title="آخرین اقدام توسط">👤 {appointment.handledBy.fullName}</span>
                          ) : null}
                          {canModerate ? (
                            <div className="rowActions">
                              {appointment.status === 'PENDING' ? (
                                <button className="miniBtn" onClick={() => updateAppointment(appointment.id, 'APPROVED')}>تأیید</button>
                              ) : null}
                              <button className="miniBtn" onClick={() => updateAppointment(appointment.id, 'ATTENDED')}>انجام شد</button>
                              <button
                                className="miniBtn danger"
                                onClick={() => {
                                  if (window.confirm('این نوبت لغو شود؟')) updateAppointment(appointment.id, 'CANCELLED');
                                }}
                              >
                                لغو
                              </button>
                              {appointment.status === 'ATTENDED' ? (
                                <button
                                  className="miniBtn"
                                  onClick={() => {
                                    setPayFormOpenId(payFormOpenId === appointment.id ? null : appointment.id);
                                    setPayDraft({ amount: '', method: 'cash' });
                                  }}
                                >
                                  صدور فاکتور
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                        {payFormOpenId === appointment.id ? (
                          <div className="reviewForm">
                            <input
                              type="number"
                              placeholder="مبلغ (تومان)"
                              value={payDraft.amount}
                              onChange={(e) => setPayDraft({ ...payDraft, amount: e.target.value })}
                            />
                            <select value={payDraft.method} onChange={(e) => setPayDraft({ ...payDraft, method: e.target.value })}>
                              <option value="cash">نقدی</option>
                              <option value="card">کارت‌خوان</option>
                              <option value="online">آنلاین</option>
                              <option value="insurance">بیمه</option>
                            </select>
                            <button className="actionBtn primary" onClick={() => handlePayForService(appointment.id)}>
                              ثبت پرداخت و صدور فاکتور
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })()
        ) : null}

        {active === 'patients' ? (
          <section className="grid2">
            <article className="panel">
              <div className="panelHeader">
                <h2>بیماران</h2>
                {canModerate ? (
                  <button className="actionBtn primary miniManage" onClick={() => setNewPatientOpen(true)}>
                    <UserPlus weight="fill" /> افزودن بیمار
                  </button>
                ) : (
                  <span>{faNum(patients.length)} نفر</span>
                )}
              </div>
              <input
                className="searchInput"
                placeholder="جستجوی بیمار (نام یا شماره تماس)…"
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
              />
              <div className="stack">
                {patients
                  .filter((patient) => {
                    const q = patientSearch.trim();
                    return !q || patient.user.fullName.includes(q) || patient.user.phone.includes(q);
                  })
                  .map((patient) => (
                    <button
                      key={patient.id}
                      className={selectedPatient?.id === patient.id ? 'patientCard active' : 'patientCard'}
                      onClick={() => setSelectedPatient(patient)}
                    >
                      <div className="patientCardMain">
                        <strong>{patient.user.fullName}</strong>
                        <span>{faNum(patient.user.phone)}</span>
                      </div>
                      {patient.insurance ? <span className="patientBadge">{patient.insurance}</span> : null}
                    </button>
                  ))}
              </div>
            </article>
            <article className="panel">
              <div className="panelHeader">
                <h2>پرونده بیمار</h2>
                {canModerate && activePatientDetail ? (
                  <button className="actionBtn primary miniManage" onClick={() => setRecordModalOpen(true)}>
                    <FolderOpen weight="fill" /> مدیریت پرونده
                  </button>
                ) : (
                  <span>{activePatientDetail ? activePatientDetail.user.fullName : 'انتخاب نشده'}</span>
                )}
              </div>
              {activePatientDetail ? (
                <div className="detailGrid">
                  <div className="full"><label>طرح درمان</label><p>{activePatientDetail.treatmentPlan ?? 'ثبت نشده'}</p></div>
                  <div className="full">
                    <label>جلسه‌های ثبت شده</label>
                    <div className="stack">
                      {(activePatientDetail.medicalRecords ?? []).length === 0 ? (
                        <p>هنوز جلسه‌ای ثبت نشده است.</p>
                      ) : (
                        activePatientDetail.medicalRecords!.map((record) => (
                          <article key={record.id} className="recordCard">
                            <div className="panelHeader">
                              <strong>{record.title}</strong>
                              <span>{new Date(record.createdAt).toLocaleDateString('fa-IR')}</span>
                            </div>
                            <p>{record.note}</p>
                            {record.createdByUser ? <small className="recordActor">ثبت‌شده توسط {record.createdByUser.fullName}</small> : null}
                          </article>
                        ))
                      )}
                    </div>
                  </div>
                  <div><label>بیمه</label><p>{activePatientDetail.insurance ?? 'ثبت نشده'}</p></div>
                  <div><label>کیف پول</label><p>{faNum(activePatientDetail.wallet.toLocaleString('fa-IR'))} تومان</p></div>
                </div>
              ) : null}
            </article>
          </section>
        ) : null}

        {active === 'finance' ? (
          <>
            <section className="statsGrid">
              <article className="panel stat"><span>درآمد کل (تومان)</span><strong>{faNum((finance?.revenue ?? 0).toLocaleString('fa-IR'))}</strong></article>
              <article className="panel stat"><span>تعداد پرداخت</span><strong>{faNum(finance?.payments ?? 0)}</strong></article>
              <article className="panel stat"><span>سفارش پرداخت‌شده</span><strong>{faNum(finance?.paidOrders ?? 0)}</strong></article>
              <article className="panel stat"><span>کل سفارش‌ها</span><strong>{faNum(finance?.totalOrders ?? 0)}</strong></article>
            </section>
            <section className="grid2">
              <article className="panel">
                <div className="panelHeader"><h2>درآمد به تفکیک روش</h2></div>
                {(finance?.byMethod ?? []).length === 0 ? (
                  <div className="emptyState"><ChartLineUp /><p>پرداختی ثبت نشده است.</p></div>
                ) : (
                  <div className="stack">
                    {finance!.byMethod.map((m) => (
                      <div key={m.method} className="tableRow">
                        <div><strong>{methodFa(m.method)}</strong></div>
                        <div>{faNum(m.count)} پرداخت</div>
                        <div className="status approved">{faNum(m.amount.toLocaleString('fa-IR'))} تومان</div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
              <article className="panel">
                <div className="panelHeader"><h2>آخرین پرداخت‌ها</h2></div>
                {(finance?.recent ?? []).length === 0 ? (
                  <div className="emptyState"><ChartLineUp /><p>پرداختی ثبت نشده است.</p></div>
                ) : (
                  <div className="stack">
                    {finance!.recent.map((p) => (
                      <div key={p.id} className="tableRow">
                        <div><strong>{p.patient}</strong><p>{methodFa(p.method)}</p></div>
                        <div>{faNum(new Date(p.createdAt).toLocaleDateString('fa-IR'))}</div>
                        <div className="status approved">{faNum(p.amount.toLocaleString('fa-IR'))} تومان</div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </section>
          </>
        ) : null}

        {active === 'topPatients' ? (
          <section className="panel">
            <div className="panelHeader">
              <h2>بیماران ویژه — ۱۰ نفر برتر</h2>
              <span>{faNum(topPatientsList.length)} بیمار</span>
            </div>
            {topPatientsList.length === 0 ? (
              <div className="emptyState"><Crown /><p>هنوز اطلاعات کافی برای رتبه‌بندی وجود ندارد.</p></div>
            ) : (
              <div className="stack">
                {topPatientsList.map((p, i) => (
                  <div key={p.id} className="rankRow">
                    <span className={`rankNum rank-${i + 1}`}>{faNum(i + 1)}</span>
                    <div className="rankMain"><strong>{p.fullName}</strong><span>{faNum(p.phone)}</span></div>
                    {p.insurance ? <span className="patientBadge">{p.insurance}</span> : null}
                    <span className="rankVisits">{faNum(p.visits)} مراجعه</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {active === 'doctors' ? (
          <section className="panel">
            <div className="panelHeader">
              <h2>پزشکان</h2>
              <span>{faNum(staffDoctorsList.length)} پزشک</span>
            </div>
            <div className="segmented">
              <button className={doctorService === 'all' ? 'segment active' : 'segment'} onClick={() => setDoctorService('all')}>همه</button>
              {Array.from(new Set(staffDoctorsList.map((d) => d.service).filter(Boolean))).map((svc) => (
                <button
                  key={svc as string}
                  className={doctorService === svc ? 'segment active' : 'segment'}
                  onClick={() => setDoctorService(svc as string)}
                >
                  {svc}
                </button>
              ))}
            </div>
            {staffDoctorsList.length === 0 ? (
              <div className="emptyState"><Tooth /><p>پزشکی ثبت نشده است.</p></div>
            ) : (
              <div className="doctorGrid">
                {staffDoctorsList
                  .filter((d) => doctorService === 'all' || d.service === doctorService)
                  .map((doc) => (
                    <article key={doc.id} className={doc.active ? 'doctorCard' : 'doctorCard inactive'}>
                      <div className="doctorTop">
                        <div className="doctorAvatar">
                          {doc.imageUrl ? <img src={mediaUrl(doc.imageUrl)} alt={doc.user.fullName} /> : <Users weight="fill" />}
                        </div>
                        <div className="doctorInfo">
                          <strong>{doc.user.fullName}</strong>
                          <span className="doctorSpec">{doc.specialty ?? doc.service ?? 'پزشک'}</span>
                          <div className="doctorStars">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star key={i} weight={i < doc.rating ? 'fill' : 'regular'} />
                            ))}
                            <span className="ratingHint">امتیاز داخلی (نامرئی برای بیمار)</span>
                          </div>
                        </div>
                        <button className="miniBtn" onClick={() => openDoctorProfile(doc.id)}>پروفایل</button>
                      </div>
                      <div className="doctorControls">
                        <div className="ctrlRow">
                          <span>وضعیت</span>
                          <button
                            className={doc.active ? 'toggle on' : 'toggle off'}
                            onClick={() => patchDoctor(doc.id, { active: !doc.active })}
                            aria-label="فعال/غیرفعال"
                          >
                            <span className="knob" />
                          </button>
                        </div>
                        <div className="ctrlRow">
                          <span>شیفت کاری</span>
                          <select value={doc.shift} onChange={(e) => patchDoctor(doc.id, { shift: e.target.value })}>
                            <option value="morning">شیفت صبح (۹ تا ۱۴)</option>
                            <option value="evening">شیفت عصر (۱۶ تا ۲۱)</option>
                          </select>
                        </div>
                        <div className="ctrlRow">
                          <span>امتیاز داخلی</span>
                          <div className="ratingStepper">
                            <button
                              type="button"
                              onClick={() => patchDoctor(doc.id, { rating: Math.max(0, doc.rating - 1) })}
                              disabled={doc.rating <= 0}
                              aria-label="کاهش امتیاز"
                            >
                              −
                            </button>
                            <strong>{faNum(doc.rating)}</strong>
                            <button
                              type="button"
                              onClick={() => patchDoctor(doc.id, { rating: Math.min(5, doc.rating + 1) })}
                              disabled={doc.rating >= 5}
                              aria-label="افزایش امتیاز"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
              </div>
            )}
          </section>
        ) : null}

        {active === 'products' ? (
          <>
            <section className="panel">
              <div className="panelHeader">
                <h2>داروخانه</h2>
                <span>{faNum(products.length)} محصول</span>
              </div>
              <div className="productGrid">
                {products.map((product) => (
                  <article key={product.id} className="productCard">
                    <span>{product.category}</span>
                    <h3>{product.name}</h3>
                    <p>{product.description}</p>
                    <strong>{faNum(product.price.toLocaleString('fa-IR'))} تومان</strong>
                    {canBook ? (
                      <button className="actionBtn primary addCartBtn" onClick={() => addToCart(product)}>
                        <Storefront weight="fill" /> افزودن به سبد
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>

            {canBook && cart.length > 0 ? (
              <section className="panel cartPanel">
                <div className="panelHeader">
                  <h2>سبد خرید</h2>
                  <span>{faNum(cart.length)} قلم</span>
                </div>
                <div className="stack">
                  {cart.map((item) => (
                    <div key={item.productId} className="cartRow">
                      <div className="cartMain">
                        <strong>{item.name}</strong>
                        <span>{faNum(item.qty)} × {faNum(item.price.toLocaleString('fa-IR'))} تومان</span>
                      </div>
                      <strong className="cartLine">{faNum((item.price * item.qty).toLocaleString('fa-IR'))} تومان</strong>
                      <button className="miniBtn danger" onClick={() => removeFromCart(item.productId)}>حذف</button>
                    </div>
                  ))}
                </div>
                <div className="cartFoot">
                  <strong>مجموع: {faNum(cartTotal.toLocaleString('fa-IR'))} تومان</strong>
                  <button className="actionBtn primary" onClick={handleCheckout}>
                    <CreditCard weight="fill" /> پرداخت و ثبت سفارش
                  </button>
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        {active === 'tickets' ? (
          <section className="panel">
            <div className="panelHeader">
              <h2>تیکت‌ها</h2>
              <span>{faNum(tickets.length)} پیام</span>
            </div>
            <div className="stack">
              {tickets.map((ticket) => (
                <article key={ticket.id} className="ticketCard">
                  <div className="ticketHeader">
                    <strong>{ticket.subject}</strong>
                    <span>{STATUS_FA[ticket.status] ?? ticket.status}</span>
                  </div>
                  <p>{ticket.text}</p>
                  <small>{ticket.sender.fullName} - {ticket.sender.phone}</small>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {active === 'audit' ? (
          <section className="panel">
            <div className="panelHeader">
              <h2>لاگ ممیزی</h2>
              <span>{faNum(auditList.length)} رویداد</span>
            </div>
            {auditList.length === 0 ? (
              <div className="emptyState"><ClipboardText /><p>هنوز رویدادی ثبت نشده است.</p></div>
            ) : (
              <div className="stack">
                {auditList.map((entry) => (
                  <div key={entry.id} className="auditRow">
                    <div className="auditMain">
                      <strong>{AUDIT_ACTION_FA[entry.action] ?? entry.action}</strong>
                      <span>{entry.entity}{entry.entityId ? ` · ${entry.entityId}` : ''}</span>
                    </div>
                    {entry.actorRole ? (
                      <span className="patientBadge">{ROLE_FA[entry.actorRole] ?? entry.actorRole}</span>
                    ) : null}
                    <span className="auditDate">{faNum(new Date(entry.createdAt).toLocaleString('fa-IR'))}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {active === 'reviews' ? (
          <section className="panel">
            <div className="panelHeader">
              <h2>رضایت‌سنجی بیماران</h2>
              <span>{faNum(reviewsList.length)} نظر</span>
            </div>
            {reviewsList.length === 0 ? (
              <div className="emptyState"><Star /><p>هنوز نظری ثبت نشده است.</p></div>
            ) : (
              <div className="stack">
                {reviewsList.map((r) => (
                  <article key={r.id} className="reviewCard">
                    <div className="panelHeader">
                      <strong>{r.doctor?.user.fullName ?? 'پزشک نامشخص'}</strong>
                      <span>{faNum(new Date(r.updatedAt).toLocaleDateString('fa-IR'))}</span>
                    </div>
                    <div className="doctorStars">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} weight={i < (r.rating ?? 0) ? 'fill' : 'regular'} />
                      ))}
                    </div>
                    {r.reviewText ? <p>{r.reviewText}</p> : <p className="muted">بدون توضیح متنی</p>}
                    <small className="recordActor">بیمار: {r.patient.user.fullName} — خدمت: {r.service}</small>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {active === 'history' ? (
          <section className="panel">
            <div className="panelHeader"><h2>تاریخچه خدمات</h2></div>
            <div className="historyFilters">
              <DatePicker
                calendar={persian}
                locale={persian_fa}
                format="YYYY/MM/DD"
                value={historyFrom}
                onChange={setHistoryFrom}
                inputClass="datePickerInput"
                placeholder="از تاریخ (شمسی)"
                calendarPosition="bottom-right"
              />
              <DatePicker
                calendar={persian}
                locale={persian_fa}
                format="YYYY/MM/DD"
                value={historyTo}
                onChange={setHistoryTo}
                inputClass="datePickerInput"
                placeholder="تا تاریخ (شمسی)"
                calendarPosition="bottom-right"
              />
              <button className="actionBtn primary" onClick={handleSearchHistory}>جست‌وجو</button>
            </div>
            <p className="formHint">
              فیلتر بر اساس تاریخ ثبت رکورد در سامانه است (نه لزوماً تاریخ نمایش‌داده‌شده‌ی نوبت که فعلاً متنی است).
            </p>
            {!historyLoaded ? (
              <div className="emptyState"><ClipboardText /><p>بازه‌ی تاریخ را انتخاب و جست‌وجو کنید.</p></div>
            ) : historyList.length === 0 ? (
              <div className="emptyState"><ClipboardText /><p>در این بازه خدمتی ثبت نشده است.</p></div>
            ) : (
              <div className="table">
                {historyList.map((h) => (
                  <div className="tableRow" key={h.id}>
                    <div>
                      <strong>{h.patient.user.fullName}</strong>
                      <p>{h.service}{h.doctor ? ` · ${h.doctor.specialty ?? h.doctor.title}` : ''}</p>
                    </div>
                    <div><strong>{faNum(h.date)}</strong><p>{faNum(h.time)}</p></div>
                    <div className={`status ${h.status.toLowerCase()}`}>{STATUS_FA[h.status] ?? h.status}</div>
                    {h.handledBy ? <span className="patientBadge">👤 {h.handledBy.fullName}</span> : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {active === 'settings' ? (
          <section className="grid2">
            <article className="panel">
              <div className="panelHeader"><h2>تغییر رمز عبور من</h2></div>
              <form className="form" onSubmit={handleChangePassword}>
                <input
                  type="password"
                  placeholder="رمز عبور فعلی"
                  value={pwForm.currentPassword}
                  onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                />
                <input
                  type="password"
                  placeholder="رمز عبور جدید"
                  value={pwForm.newPassword}
                  onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                />
                <button className="actionBtn primary" type="submit">ثبت رمز جدید</button>
              </form>
              {pwMsg ? <p className="formHint">{pwMsg}</p> : null}
            </article>
            {currentUser?.role === 'ADMIN' ? (
              <article className="panel">
                <div className="panelHeader"><h2>بازنشانی رمز کارکنان</h2></div>
                <form className="form" onSubmit={handleAdminReset}>
                  <select value={resetTarget} onChange={(e) => setResetTarget(e.target.value)}>
                    <option value="">انتخاب کارمند…</option>
                    {staffUsersList.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} — {ROLE_FA[u.role] ?? u.role} ({faNum(u.phone)})
                      </option>
                    ))}
                  </select>
                  <input
                    type="password"
                    placeholder="رمز عبور جدید برای این کارمند"
                    value={resetPw}
                    onChange={(e) => setResetPw(e.target.value)}
                  />
                  <button className="actionBtn primary" type="submit">بازنشانی رمز</button>
                </form>
              </article>
            ) : null}
          </section>
        ) : null}

        {active === 'deployment' ? (
          <section className="panel">
            <h2>استقرار پیشنهادی</h2>
            <div className="stack">
              <p>1. VPS ایران با Ubuntu 24.04 LTS</p>
              <p>2. Docker Compose برای API، Web، PostgreSQL و Redis</p>
              <p>3. فایل‌ها و بکاپ‌ها روی storage داخلی یا object storage ایرانی</p>
              <p>4. DNS و SSL روی همان زیرساخت داخلی برای کاهش وابستگی خارجی</p>
            </div>
          </section>
        ) : null}
      </main>

      {menuOpen ? (
        <div className="drawerOverlay" onClick={() => setMenuOpen(false)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawerHead">
              <strong>منوی دسترسی</strong>
              <button className="iconBtn" aria-label="بستن" onClick={() => setMenuOpen(false)}><X weight="bold" /></button>
            </div>
            {!currentUser ? (
              <button
                className="drawerPrimary"
                onClick={() => {
                  setAuthOpen(true);
                  setMenuOpen(false);
                }}
              >
                <UserPlus weight="fill" /> ورود بیماران
              </button>
            ) : null}
            {visibleSections.map((section) => (
              <button
                key={section.id}
                className={section.id === active ? 'drawerItem active' : 'drawerItem'}
                onClick={() => {
                  setActive(section.id);
                  setMenuOpen(false);
                }}
              >
                <section.Icon weight={section.id === active ? 'fill' : 'regular'} />
                <span>{section.label}</span>
              </button>
            ))}
            {currentUser ? (
              <button
                className="drawerItem"
                onClick={() => {
                  handleLogout();
                  setMenuOpen(false);
                }}
              >
                <span>خروج از حساب</span>
              </button>
            ) : null}
          </aside>
        </div>
      ) : null}

      {recordModalOpen && activePatientDetail ? (
        <div className="modalOverlay" onClick={() => setRecordModalOpen(false)}>
          <div className="modal recordModal" onClick={(e) => e.stopPropagation()}>
            <button className="modalClose" aria-label="بستن" onClick={() => setRecordModalOpen(false)}>
              <X weight="bold" />
            </button>
            <div className="recordModalHead">
              <FolderOpen weight="fill" />
              <h2>پرونده جامع پزشکی دندانپزشکی</h2>
            </div>
            <div className="recordGrid">
              <aside className="recordSidebar">
                <div className="recordAvatar"><Users weight="fill" /></div>
                <h3>{activePatientDetail.user.fullName}</h3>
                <span className="recordRole">بیمار</span>
                <div className="recordMeta">
                  <div><label>شماره تماس</label><p>{faNum(activePatientDetail.user.phone)}</p></div>
                  <div><label>بیمه</label><p>{activePatientDetail.insurance ?? 'ثبت نشده'}</p></div>
                  <div><label>کیف پول</label><p>{faNum(activePatientDetail.wallet.toLocaleString('fa-IR'))} تومان</p></div>
                </div>
                <div className="recordPlan">
                  <div className="planHead">
                    <strong>طرح درمان</strong>
                    {activePatientDetail.treatmentPlan ? <span className="status approved">فعال</span> : null}
                  </div>
                  <p>{activePatientDetail.treatmentPlan || 'طرح درمانی ثبت نشده است.'}</p>
                </div>
              </aside>
              <div className="recordMain">
                <div className="recordBox">
                  <div className="panelHeader"><h3>ثبت رویداد جلسه جدید</h3></div>
                  <form className="form" onSubmit={handleRecordSubmit}>
                    <input
                      placeholder="عنوان (مثال: جلسه ۱)"
                      value={recordDraft.title}
                      onChange={(e) => setRecordDraft({ ...recordDraft, title: e.target.value })}
                    />
                    <textarea
                      placeholder="شرح کامل معاینه، درمان انجام‌شده و دستورالعمل‌های تجویزشده…"
                      rows={5}
                      value={recordDraft.note}
                      onChange={(e) => setRecordDraft({ ...recordDraft, note: e.target.value })}
                    />
                    <label className="uploadBtn">
                      <Camera weight="fill" />
                      {uploading ? 'در حال آپلود…' : 'پیوست عکس برای این جلسه'}
                      <input type="file" accept="image/*" multiple hidden onChange={handleRecordUpload} disabled={uploading} />
                    </label>
                    {recordImages.length > 0 ? (
                      <div className="imageStrip">
                        {recordImages.map((url) => (
                          <div key={url} className="thumb">
                            <img src={mediaUrl(url)} alt="پیوست" />
                            <button
                              type="button"
                              className="thumbRemove"
                              aria-label="حذف"
                              onClick={() => setRecordImages((prev) => prev.filter((u) => u !== url))}
                            >
                              <X weight="bold" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <button className="actionBtn primary" type="submit">
                      <FloppyDisk weight="fill" /> ثبت نهایی در پرونده
                    </button>
                  </form>
                </div>
                <div className="recordBox">
                  <div className="panelHeader">
                    <h3>تاریخچه جلسات درمانی ({faNum((activePatientDetail.medicalRecords ?? []).length)})</h3>
                  </div>
                  {(activePatientDetail.medicalRecords ?? []).length === 0 ? (
                    <div className="emptyState"><FolderOpen /><p>هنوز هیچ جلسه‌ای در این پرونده ثبت نشده است.</p></div>
                  ) : (
                    <div className="stack">
                      {activePatientDetail.medicalRecords!.map((record) => (
                        <article key={record.id} className="recordCard">
                          <div className="panelHeader">
                            <strong>{record.title}</strong>
                            <span>{faNum(new Date(record.createdAt).toLocaleDateString('fa-IR'))}</span>
                          </div>
                          <p>{record.note}</p>
                          {record.createdByUser ? <small className="recordActor">ثبت‌شده توسط {record.createdByUser.fullName}</small> : null}
                          {record.images?.length ? (
                            <div className="imageStrip">
                              {record.images.map((url) => (
                                <a key={url} className="thumb" href={mediaUrl(url)} target="_blank" rel="noreferrer">
                                  <img src={mediaUrl(url)} alt="پیوست جلسه" />
                                </a>
                              ))}
                            </div>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {shortcutOpen ? (
        <div className="modalOverlay" onClick={() => setShortcutOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modalClose" aria-label="بستن" onClick={() => setShortcutOpen(null)}>
              <X weight="bold" />
            </button>
            {shortcutOpen === 'costs' ? (
              <>
                <div className="panelHeader"><h2>تعرفه خدمات</h2></div>
                {products.length === 0 ? (
                  <div className="emptyState"><Wallet /><p>تعرفه‌ای ثبت نشده است.</p></div>
                ) : (
                  <div className="stack">
                    {products.map((p) => (
                      <div key={p.id} className="tableRow">
                        <div><strong>{p.name}</strong><p>{p.category}</p></div>
                        <div className="status approved">{faNum(p.price.toLocaleString('fa-IR'))} تومان</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : null}
            {shortcutOpen === 'doctors' ? (
              <>
                <div className="panelHeader"><h2>لیست پزشکان</h2></div>
                {doctors.length === 0 ? (
                  <div className="emptyState"><Star /><p>پزشکی ثبت نشده است.</p></div>
                ) : (
                  <div className="stack">
                    {doctors.map((d) => (
                      <button
                        key={d.id}
                        className="tableRow patientCard"
                        onClick={() => {
                          setShortcutOpen(null);
                          openDoctorProfile(d.id);
                        }}
                      >
                        <div><strong>{d.user.fullName}</strong><p>{d.specialty ?? d.service ?? d.title}</p></div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : null}
            {shortcutOpen === 'insurance' ? (
              <>
                <div className="panelHeader"><h2>طرف‌قرارداد بیمه‌ها</h2></div>
                <div className="stack">
                  {INSURANCE_PARTNERS.map((name) => (
                    <div key={name} className="tableRow"><div><strong>{name}</strong></div></div>
                  ))}
                </div>
              </>
            ) : null}
            {shortcutOpen === 'care' ? (
              <>
                <div className="panelHeader"><h2>مراقبت‌های پس از درمان</h2></div>
                <div className="stack">
                  {CARE_TIPS.map((tip) => (
                    <article key={tip.title} className="recordCard">
                      <strong>{tip.title}</strong>
                      <p>{tip.note}</p>
                    </article>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {doctorProfileData ? (
        <div className="modalOverlay" onClick={() => setDoctorProfileData(null)}>
          <div className="modal doctorProfileModal" onClick={(e) => e.stopPropagation()}>
            <button className="modalClose" aria-label="بستن" onClick={() => setDoctorProfileData(null)}>
              <X weight="bold" />
            </button>
            <div className="doctorProfileHead">
              <div className="doctorAvatar lg">
                {doctorProfileData.imageUrl ? (
                  <img src={mediaUrl(doctorProfileData.imageUrl)} alt={doctorProfileData.user.fullName} />
                ) : (
                  <Users weight="fill" />
                )}
              </div>
              <h2>{doctorProfileData.user.fullName}</h2>
              <span className="doctorSpec">{doctorProfileData.specialty ?? doctorProfileData.service ?? doctorProfileData.title}</span>
              {doctorProfileData.avgRating != null ? (
                <div className="doctorStars">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} weight={i < Math.round(doctorProfileData.avgRating!) ? 'fill' : 'regular'} />
                  ))}
                  <span>({faNum(doctorProfileData.reviewCount)} نظر بیمار)</span>
                </div>
              ) : (
                <span className="ratingHint">هنوز نظری از بیماران ثبت نشده است.</span>
              )}
            </div>

            {!profileEditOpen ? (
              <>
                <p className="doctorBio">{doctorProfileData.bio || 'بیوگرافی این پزشک هنوز ثبت نشده است.'}</p>
                {canModerate ? (
                  <button className="actionBtn primary" onClick={() => setProfileEditOpen(true)}>
                    ویرایش پروفایل
                  </button>
                ) : null}
              </>
            ) : (
              <div className="form">
                <label className="uploadBtn">
                  <Camera weight="fill" />
                  {profileUploading ? 'در حال آپلود…' : 'تغییر عکس پروفایل'}
                  <input type="file" accept="image/*" hidden onChange={handleDoctorPhotoUpload} disabled={profileUploading} />
                </label>
                <textarea
                  placeholder="بیوگرافی و توضیحات پزشک…"
                  rows={4}
                  value={profileBioDraft}
                  onChange={(e) => setProfileBioDraft(e.target.value)}
                />
                <button className="actionBtn primary" onClick={handleSaveDoctorProfile}>ذخیره پروفایل</button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {serviceInvoice ? (
        <div className="modalOverlay" onClick={() => setServiceInvoice(null)}>
          <div className="modal invoiceModal" onClick={(e) => e.stopPropagation()}>
            <button className="modalClose" aria-label="بستن" onClick={() => setServiceInvoice(null)}>
              <X weight="bold" />
            </button>
            <div className="invoiceHead">
              <div className="invoiceCheck"><CheckCircle weight="fill" /></div>
              <h2>فاکتور خدمت</h2>
              <p>فاکتور نوبت درمانی صادر شد.</p>
            </div>
            <div className="invoiceMeta">
              <div><label>بیمار</label><span>{serviceInvoice.patient.user.fullName}</span></div>
              <div><label>خدمت</label><span>{serviceInvoice.service}</span></div>
              <div><label>پزشک</label><span>{serviceInvoice.doctor?.user.fullName ?? 'تعیین‌نشده'}</span></div>
            </div>
            <table className="invoiceTable">
              <thead>
                <tr><th>روش پرداخت</th><th>مبلغ</th><th>تاریخ</th></tr>
              </thead>
              <tbody>
                {serviceInvoice.payments.map((p) => (
                  <tr key={p.id}>
                    <td>{methodFa(p.method)}</td>
                    <td>{faNum(p.amount.toLocaleString('fa-IR'))} تومان</td>
                    <td>{faNum(new Date(p.createdAt).toLocaleDateString('fa-IR'))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="invoiceTotal">
              <span>مبلغ کل</span>
              <strong>
                {faNum(serviceInvoice.payments.reduce((sum, p) => sum + p.amount, 0).toLocaleString('fa-IR'))} تومان
              </strong>
            </div>
          </div>
        </div>
      ) : null}

      {invoice ? (
        <div className="modalOverlay" onClick={() => setInvoice(null)}>
          <div className="modal invoiceModal" onClick={(e) => e.stopPropagation()}>
            <button className="modalClose" aria-label="بستن" onClick={() => setInvoice(null)}>
              <X weight="bold" />
            </button>
            <div className="invoiceHead">
              <div className="invoiceCheck"><CheckCircle weight="fill" /></div>
              <h2>پرداخت موفق</h2>
              <p>فاکتور سفارش شما صادر شد.</p>
            </div>
            <div className="invoiceMeta">
              <div><label>بیمار</label><span>{invoice.patient.user.fullName}</span></div>
              <div><label>تاریخ</label><span>{faNum(new Date(invoice.createdAt).toLocaleDateString('fa-IR'))}</span></div>
              <div><label>وضعیت</label><span className="status approved">{invoice.status === 'PAID' ? 'پرداخت شده' : invoice.status}</span></div>
            </div>
            <table className="invoiceTable">
              <thead>
                <tr><th>محصول</th><th>تعداد</th><th>قیمت واحد</th><th>جمع</th></tr>
              </thead>
              <tbody>
                {invoice.items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.product.name}</td>
                    <td>{faNum(it.qty)}</td>
                    <td>{faNum(it.unitPrice.toLocaleString('fa-IR'))}</td>
                    <td>{faNum((it.unitPrice * it.qty).toLocaleString('fa-IR'))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="invoiceTotal">
              <span>مبلغ کل</span>
              <strong>{faNum(invoice.total.toLocaleString('fa-IR'))} تومان</strong>
            </div>
            {invoice.payments.find((p) => p.status === 'PAID')?.reference ? (
              <p className="invoiceRef">کد پیگیری: {faNum(invoice.payments.find((p) => p.status === 'PAID')!.reference!)}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {authOpen ? (
        <div className="modalOverlay" onClick={() => setAuthOpen(false)}>
          <div className="modal authModal" onClick={(e) => e.stopPropagation()}>
            <button className="modalClose" aria-label="بستن" onClick={() => setAuthOpen(false)}>
              <X weight="bold" />
            </button>
            <div className="authHead">
              <div className="authAvatar"><UserPlus weight="fill" /></div>
              <h2>خوش آمدید</h2>
              <p>برای ادامه وارد شوید یا حساب جدید بسازید</p>
            </div>

            <div className="segmented">
              <button className={authMode === 'patient-login' ? 'segment active' : 'segment'} onClick={() => setAuthMode('patient-login')}>ورود بیمار</button>
              <button className={authMode === 'patient-otp' ? 'segment active' : 'segment'} onClick={() => setAuthMode('patient-otp')}>ورود با کد ملی</button>
              <button className={authMode === 'patient-register' ? 'segment active' : 'segment'} onClick={() => setAuthMode('patient-register')}>ثبت‌نام بیمار</button>
              <button className={authMode === 'staff-login' ? 'segment active' : 'segment'} onClick={() => setAuthMode('staff-login')}>ورود پرسنل</button>
            </div>

            {authMode === 'patient-otp' ? (
              <form className="form" onSubmit={handleVerifyOtp}>
                <input
                  placeholder="کد ملی"
                  value={otpNationalId}
                  onChange={(e) => {
                    setOtpNationalId(e.target.value);
                    setOtpSent(false);
                  }}
                  disabled={otpSent}
                />
                {!otpSent ? (
                  <button type="button" className="actionBtn primary authSubmit" onClick={handleRequestOtp}>
                    دریافت کد پیامکی
                  </button>
                ) : (
                  <>
                    <p className="formHint">کد ۵ رقمی به شماره‌ی ثبت‌شده‌ی شما پیامک شد.</p>
                    <input
                      placeholder="کد پیامکی"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      inputMode="numeric"
                    />
                    <button className="actionBtn primary authSubmit" type="submit">ورود</button>
                    <button type="button" className="miniBtn" onClick={handleRequestOtp}>ارسال مجدد کد</button>
                  </>
                )}
              </form>
            ) : (
              <form className="form" onSubmit={handleAuthSubmit}>
                {authMode !== 'staff-login' ? (
                  <>
                    {authMode === 'patient-register' ? (
                      <>
                        <input placeholder="نام و نام خانوادگی" value={patientAuth.fullName} onChange={(e) => setPatientAuth({ ...patientAuth, fullName: e.target.value })} />
                        <input placeholder="کد ملی" value={patientAuth.nationalId} onChange={(e) => setPatientAuth({ ...patientAuth, nationalId: e.target.value })} />
                        <input placeholder="بیمه" value={patientAuth.insurance} onChange={(e) => setPatientAuth({ ...patientAuth, insurance: e.target.value })} />
                      </>
                    ) : null}
                    <input placeholder="شماره موبایل" value={patientAuth.phone} onChange={(e) => setPatientAuth({ ...patientAuth, phone: e.target.value })} />
                    <input placeholder="رمز عبور" type="password" value={patientAuth.password} onChange={(e) => setPatientAuth({ ...patientAuth, password: e.target.value })} />
                  </>
                ) : (
                  <>
                    <select value={staffAuth.role} onChange={(e) => setStaffAuth({ ...staffAuth, role: e.target.value })}>
                      {staffRoles.map((role) => (
                        <option key={role.value} value={role.value}>{role.label}</option>
                      ))}
                    </select>
                    <input placeholder="شماره موبایل" value={staffAuth.phone} onChange={(e) => setStaffAuth({ ...staffAuth, phone: e.target.value })} />
                    <input placeholder="رمز عبور" type="password" value={staffAuth.password} onChange={(e) => setStaffAuth({ ...staffAuth, password: e.target.value })} />
                  </>
                )}
                <button className="actionBtn primary authSubmit" type="submit">
                  {authMode === 'patient-register' ? 'ورود و تشکیل پرونده اولیه' : 'ورود به حساب'}
                </button>
              </form>
            )}
          </div>
        </div>
      ) : null}

      {newPatientOpen ? (
        <div className="modalOverlay" onClick={() => setNewPatientOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="panelHeader">
              <h2>افزودن بیمار جدید</h2>
              <button className="actionBtn" onClick={() => setNewPatientOpen(false)}>بستن</button>
            </div>
            <form className="form" onSubmit={handleCreatePatient}>
              <input placeholder="نام و نام خانوادگی" value={newPatient.fullName} onChange={(e) => setNewPatient({ ...newPatient, fullName: e.target.value })} />
              <input placeholder="شماره موبایل" value={newPatient.phone} onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })} />
              <input placeholder="کد ملی (اختیاری)" value={newPatient.nationalId} onChange={(e) => setNewPatient({ ...newPatient, nationalId: e.target.value })} />
              <input placeholder="بیمه (اختیاری)" value={newPatient.insurance} onChange={(e) => setNewPatient({ ...newPatient, insurance: e.target.value })} />
              <p className="formHint">رمز عبور اولیه = شماره موبایل. بیمار پس از ورود می‌تواند آن را تغییر دهد.</p>
              <button className="actionBtn primary" type="submit">ثبت بیمار</button>
            </form>
          </div>
        </div>
      ) : null}

      {bookingOpen ? (
        <div className="modalOverlay">
          <div className="modal">
            <div className="panelHeader">
              <h2>ثبت نوبت</h2>
              <button className="actionBtn" onClick={() => setBookingOpen(false)}>بستن</button>
            </div>
            <form className="form" onSubmit={handleBookingSubmit}>
              <select value={booking.doctorId} onChange={(e) => setBooking({ ...booking, doctorId: e.target.value })}>
                <option value="">پزشک را انتخاب کنید (اختیاری)</option>
                {doctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.user.fullName} - {doctor.specialty ?? doctor.service ?? doctor.title}
                  </option>
                ))}
              </select>
              <input placeholder="نوع خدمت" value={booking.service} onChange={(e) => setBooking({ ...booking, service: e.target.value })} />
              <DatePicker
                calendar={persian}
                locale={persian_fa}
                format="YYYY/MM/DD"
                value={booking.date}
                onChange={(d) => setBooking({ ...booking, date: d ? d.format('YYYY/MM/DD') : '' })}
                inputClass="datePickerInput"
                placeholder="تاریخ نوبت (شمسی)"
                calendarPosition="bottom-right"
              />
              <input
                type="time"
                aria-label="ساعت نوبت"
                value={booking.time}
                onChange={(e) => setBooking({ ...booking, time: e.target.value })}
              />
              <button className="actionBtn primary" type="submit">ثبت نوبت</button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
