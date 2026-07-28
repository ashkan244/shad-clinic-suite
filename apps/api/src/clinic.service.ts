import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Appointment, AppointmentStatus, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PrismaService } from './prisma.service.js';
import { NotificationsService } from './notifications.service.js';
import { RemindersService } from './reminders.service.js';

type CreateAppointmentInput = {
  patientId: string;
  doctorId?: string;
  service: string;
  date: string;
  time: string;
  scheduledAt?: string;
};

@Injectable()
export class ClinicService {
  private readonly logger = new Logger(ClinicService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly reminders: RemindersService
  ) {}

  async dashboard() {
    const [patients, appointments, staff, products, tickets, revenue] = await Promise.all([
      this.prisma.patient.count(),
      this.prisma.appointment.count(),
      this.prisma.staffProfile.count(),
      this.prisma.product.count(),
      this.prisma.ticket.count(),
      this.prisma.payment.aggregate({ _sum: { amount: true } })
    ]);

    return {
      patients,
      appointments,
      staff,
      products,
      tickets,
      revenue: revenue._sum.amount ?? 0
    };
  }

  patients() {
    return this.prisma.patient.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: true, appointments: true }
    });
  }

  patientById(id: string) {
    return this.prisma.patient.findUnique({
      where: { id },
      include: {
        user: true,
        appointments: { orderBy: { createdAt: 'desc' }, include: { doctor: { include: { user: true } } } },
        // (#7) surface who (which staff profile) recorded each session.
        medicalRecords: { orderBy: { createdAt: 'desc' }, include: { createdByUser: true } },
        orders: true
      }
    });
  }

  async updatePatient(id: string, data: Record<string, unknown>) {
    return this.prisma.patient.update({ where: { id }, data });
  }

  /**
   * Reception creates a patient (walk-in). Temp password = phone number so the
   * patient can log in and change it later. Returns the created user (no hash).
   */
  async createPatient(input: { fullName: string; phone: string; nationalId?: string; insurance?: string }) {
    const existing = await this.prisma.user.findUnique({ where: { phone: input.phone } });
    if (existing) throw new BadRequestException('این شماره قبلاً ثبت شده است.');
    const user = await this.prisma.user.create({
      data: {
        role: Role.PATIENT,
        phone: input.phone,
        fullName: input.fullName,
        passwordHash: await bcrypt.hash(input.phone, 10),
        patient: { create: { nationalId: input.nationalId, insurance: input.insurance } }
      },
      include: { patient: true }
    });
    const { passwordHash: _omit, ...safe } = user;
    return safe;
  }

  /** Returns the owning user id for a patient, or null. Used for ownership checks. */
  async patientUserId(patientId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { userId: true }
    });
    return patient?.userId ?? null;
  }

  /** Returns the owning user id behind an order, or null. Used for ownership checks. */
  async orderOwnerUserId(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { patient: { select: { userId: true } } }
    });
    return order?.patient?.userId ?? null;
  }

  appointments() {
    return this.prisma.appointment.findMany({
      orderBy: { createdAt: 'desc' },
      include: { patient: { include: { user: true } }, doctor: true }
    });
  }

  doctors() {
    return this.prisma.staffProfile.findMany({
      where: { active: true, title: 'پزشک' },
      orderBy: { rating: 'desc' },
      include: { user: true }
    });
  }

  async createAppointment(input: CreateAppointmentInput) {
    const conflict = await this.prisma.appointment.findFirst({
      where: {
        doctorId: input.doctorId,
        date: input.date,
        time: input.time,
        status: { in: [AppointmentStatus.PENDING, AppointmentStatus.APPROVED] }
      }
    });
    if (conflict) {
      throw new BadRequestException('این زمان قبلاً رزرو شده است.');
    }
    // Was there an earlier appointment for this patient? Distinguishes the
    // (ب) first-booking vs (پ) follow-up-booking SMS wording.
    const priorCount = await this.prisma.appointment.count({ where: { patientId: input.patientId } });

    const created = await this.prisma.appointment.create({
      data: {
        patientId: input.patientId,
        doctorId: input.doctorId,
        service: input.service,
        date: input.date,
        time: input.time,
        // Only touch scheduledAt when provided, so booking keeps working on a DB
        // that hasn't run the scheduledAt migration yet (see prisma:push).
        ...(input.scheduledAt ? { scheduledAt: new Date(input.scheduledAt) } : {})
      }
    });
    const when = `${created.service} در ${created.date} ساعت ${created.time}`;
    await this.notifyPatient(created.patientId, {
      appointmentId: created.id,
      title: priorCount === 0 ? 'ثبت نوبت' : 'ثبت نوبت بعدی',
      body:
        priorCount === 0
          ? `نوبت شما برای ${when} ثبت شد و در انتظار تأیید است.`
          : `نوبت بعدی شما برای ${when} با موفقیت ثبت شد و در انتظار تأیید است.`
    });
    await this.reminders.schedule(created);
    return created;
  }

  async updateAppointmentStatus(id: string, status: AppointmentStatus, cancelReason?: string) {
    const appointment = await this.prisma.appointment.findUnique({ where: { id } });
    if (!appointment) throw new NotFoundException('نوبت پیدا نشد.');
    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { status, cancelReason }
    });
    const message = this.statusMessage(updated, cancelReason);
    if (message) {
      await this.notifyPatient(updated.patientId, { appointmentId: updated.id, ...message });
    }
    // Keep the reminder in sync with the new status.
    if (updated.status === AppointmentStatus.APPROVED) {
      await this.reminders.schedule(updated);
    } else if (updated.status !== AppointmentStatus.PENDING) {
      await this.reminders.cancel(updated.id);
    }
    return updated;
  }

  /** (#11) Patient submits a satisfaction rating/comment for a completed appointment. */
  async submitReview(appointmentId: string, requestingUserId: string, rating: number, reviewText?: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { patient: true }
    });
    if (!appointment) throw new NotFoundException('نوبت پیدا نشد.');
    if (appointment.patient.userId !== requestingUserId) {
      throw new BadRequestException('این نوبت متعلق به شما نیست.');
    }
    if (appointment.status !== AppointmentStatus.ATTENDED) {
      throw new BadRequestException('فقط پس از انجام نوبت می‌توانید رضایت خود را ثبت کنید.');
    }
    return this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { reviewed: true, rating, reviewText }
    });
  }

  /** (#11) Reviews for the admin panel — all, or scoped to one doctor. */
  doctorReviews(doctorId?: string) {
    return this.prisma.appointment.findMany({
      where: { reviewed: true, ...(doctorId ? { doctorId } : {}) },
      orderBy: { updatedAt: 'desc' },
      include: {
        patient: { include: { user: true } },
        doctor: { include: { user: true } }
      }
    });
  }

  /** Persist + dispatch a notification to the patient behind an appointment. Never throws. */
  private async notifyPatient(
    patientId: string,
    payload: { appointmentId?: string; title: string; body: string }
  ) {
    try {
      const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
      if (!patient) return;
      await this.notifications.notify({
        userId: patient.userId,
        patientId,
        appointmentId: payload.appointmentId,
        title: payload.title,
        body: payload.body
      });
    } catch (err) {
      this.logger.warn(`Failed to notify patient ${patientId}: ${String(err)}`);
    }
  }

  private statusMessage(
    appointment: Appointment,
    cancelReason?: string
  ): { title: string; body: string } | null {
    const when = `${appointment.service} در ${appointment.date} ساعت ${appointment.time}`;
    const reason = cancelReason ? ` دلیل: ${cancelReason}` : '';
    switch (appointment.status) {
      case AppointmentStatus.APPROVED:
        return { title: 'تأیید نوبت', body: `نوبت شما (${when}) تأیید شد.` };
      case AppointmentStatus.REJECTED:
        return { title: 'رد نوبت', body: `نوبت شما (${when}) رد شد.${reason}` };
      case AppointmentStatus.CANCELLED:
        return { title: 'لغو نوبت', body: `نوبت شما (${when}) لغو شد.${reason}` };
      case AppointmentStatus.ABSENT:
        return { title: 'عدم حضور', body: `عدم حضور شما در نوبت (${when}) ثبت شد.` };
      case AppointmentStatus.ATTENDED:
        return {
          title: 'پایان نوبت',
          body: `از مراجعه‌ی شما متشکریم (${when}). لطفاً از طریق پنل خود، رضایت خود را از پزشک ثبت کنید.`
        };
      default:
        return null; // PENDING / CONSULTATION_REQUESTED → no SMS
    }
  }

  async medicalRecordCreate(data: {
    patientId: string;
    appointmentId?: string;
    title: string;
    note: string;
    images?: string[];
    createdByUserId: string;
  }) {
    return this.prisma.medicalRecord.create({
      data: {
        patientId: data.patientId,
        appointmentId: data.appointmentId,
        title: data.title,
        note: data.note,
        images: data.images ?? [],
        createdByUserId: data.createdByUserId
      }
    });
  }

  products() {
    return this.prisma.product.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async createOrder(patientId: string, items: Array<{ productId: string; qty: number }>) {
    const productIds = items.map((item) => item.productId);
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } } });
    const lookup = new Map(products.map((product) => [product.id, product]));
    const normalized = items.map((item) => {
      const product = lookup.get(item.productId);
      if (!product) throw new BadRequestException('محصول نامعتبر است.');
      if (item.qty < 1) throw new BadRequestException('تعداد نامعتبر است.');
      return { product, qty: item.qty };
    });
    const total = normalized.reduce((sum, item) => sum + item.product.price * item.qty, 0);
    return this.prisma.order.create({
      data: {
        patientId,
        total,
        items: {
          create: normalized.map((item) => ({
            productId: item.product.id,
            qty: item.qty,
            unitPrice: item.product.price
          }))
        }
      },
      include: { items: true }
    });
  }

  async payOrder(orderId: string, method: string, reference?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('سفارش پیدا نشد.');
    const payment = await this.prisma.payment.create({
      data: {
        orderId,
        patientId: order.patientId,
        amount: order.total,
        method,
        reference
      }
    });
    await this.prisma.order.update({ where: { id: orderId }, data: { status: 'PAID' } });
    return payment;
  }

  /** (#13) Records a manual payment for a clinical service (not a pharmacy order). */
  async payForService(appointmentId: string, amount: number, method: string, reference?: string) {
    const appointment = await this.prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment) throw new NotFoundException('نوبت پیدا نشد.');
    return this.prisma.payment.create({
      data: { appointmentId, patientId: appointment.patientId, amount, method, reference, status: 'PAID' }
    });
  }

  /** (#13) Service invoice — the appointment + patient/doctor + any payments recorded against it. */
  async serviceInvoice(appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: { include: { user: true } },
        doctor: { include: { user: true } },
        payments: { orderBy: { createdAt: 'desc' } }
      }
    });
    if (!appointment) throw new NotFoundException('نوبت پیدا نشد.');
    return appointment;
  }

  /**
   * (#9) Full service history in a date range, for the admin panel.
   * Filters on `createdAt` (a real, always-populated DateTime) rather than the
   * free-text `date`/`time` fields, which aren't reliably parseable — see
   * scheduledAt migration note.
   */
  serviceHistory(from: Date, to: Date) {
    return this.prisma.appointment.findMany({
      where: { createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: 'desc' },
      include: {
        patient: { include: { user: true } },
        doctor: { include: { user: true } },
        payments: true
      }
    });
  }

  tickets(role?: Role) {
    return this.prisma.ticket.findMany({
      where: role ? { receiverRole: role } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { sender: true }
    });
  }

  async createTicket(data: {
    senderUserId: string;
    receiverRole: Role;
    subject: string;
    text: string;
  }) {
    return this.prisma.ticket.create({ data });
  }

  /** All doctors (active + inactive) for the management screen. */
  staffDoctors() {
    return this.prisma.staffProfile.findMany({
      where: { title: 'پزشک' },
      orderBy: [{ service: 'asc' }, { rating: 'desc' }],
      include: { user: true }
    });
  }

  async updateDoctor(
    id: string,
    data: { active?: boolean; shift?: string; rating?: number; bio?: string; imageUrl?: string }
  ) {
    return this.prisma.staffProfile.update({ where: { id }, data });
  }

  /**
   * (#12) Public doctor profile — bio/photo/specialty + the average of patient
   * satisfaction reviews (Appointment.rating where reviewed=true). This is
   * deliberately NOT the admin-controlled StaffProfile.rating (item #5).
   */
  async doctorProfile(id: string) {
    const doctor = await this.prisma.staffProfile.findUnique({ where: { id }, include: { user: true } });
    if (!doctor) throw new NotFoundException('پزشک پیدا نشد.');
    const reviews = await this.prisma.appointment.findMany({
      where: { doctorId: id, reviewed: true, rating: { not: null } },
      select: { rating: true }
    });
    const reviewCount = reviews.length;
    const avgRating = reviewCount === 0 ? null : reviews.reduce((sum, r) => sum + (r.rating ?? 0), 0) / reviewCount;
    return { ...doctor, reviewCount, avgRating };
  }

  /** All staff accounts (ADMIN/RECEPTION/DOCTOR) — used by the admin panel to reset passwords. */
  staffUsers() {
    return this.prisma.user.findMany({
      where: { role: { in: [Role.ADMIN, Role.RECEPTION, Role.DOCTOR] } },
      select: { id: true, fullName: true, phone: true, role: true },
      orderBy: { fullName: 'asc' }
    });
  }

  /** Patients ranked by number of visits (appointments), top N. */
  async topPatients(limit = 10) {
    const patients = await this.prisma.patient.findMany({
      include: { user: true, _count: { select: { appointments: true } } }
    });
    return patients
      .map((p) => ({
        id: p.id,
        fullName: p.user.fullName,
        phone: p.user.phone,
        insurance: p.insurance,
        visits: p._count.appointments
      }))
      .filter((p) => p.visits > 0)
      .sort((a, b) => b.visits - a.visits)
      .slice(0, limit);
  }

  /** Financial summary: revenue, payment/order counts, breakdown by method, recent payments. */
  async financeReport() {
    const [agg, payments, paidOrders, totalOrders, byMethod, recent] = await Promise.all([
      this.prisma.payment.aggregate({ _sum: { amount: true } }),
      this.prisma.payment.count(),
      this.prisma.order.count({ where: { status: 'PAID' } }),
      this.prisma.order.count(),
      this.prisma.payment.groupBy({ by: ['method'], _sum: { amount: true }, _count: true }),
      this.prisma.payment.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { patient: { include: { user: true } } }
      })
    ]);
    return {
      revenue: agg._sum.amount ?? 0,
      payments,
      paidOrders,
      totalOrders,
      byMethod: byMethod.map((m) => ({ method: m.method, amount: m._sum.amount ?? 0, count: m._count })),
      recent: recent.map((p) => ({
        id: p.id,
        amount: p.amount,
        method: p.method,
        createdAt: p.createdAt,
        patient: p.patient?.user.fullName ?? '—'
      }))
    };
  }
}
