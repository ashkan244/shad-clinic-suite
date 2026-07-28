import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AppointmentStatus, Role } from '@prisma/client';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { Public, Roles, STAFF_ROLES } from './auth.decorators.js';
import { ClinicService } from './clinic.service.js';
import { PaymentService } from './payment.service.js';
import { AuditService } from './audit.service.js';

type AuthedRequest = { user: { sub: string; role: Role } };

interface UploadedImage {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const UPLOAD_DIR = join(process.cwd(), 'uploads');
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

class CreateAppointmentDto {
  @IsString() patientId!: string;
  @IsOptional() @IsString() doctorId?: string;
  @IsString() service!: string;
  @IsString() date!: string;
  @IsString() time!: string;
  @IsOptional() @IsString() scheduledAt?: string;
}

class CreateRecordDto {
  @IsString() patientId!: string;
  @IsOptional() @IsString() appointmentId?: string;
  @IsString() title!: string;
  @IsString() note!: string;
  @IsOptional() @IsArray() images?: string[];
  @IsString() createdByUserId!: string;
}

class CreateTicketDto {
  @IsString() senderUserId!: string;
  @IsString() receiverRole!: Role;
  @IsString() subject!: string;
  @IsString() text!: string;
}

class CreateOrderDto {
  @IsString() patientId!: string;
  @IsArray() items!: Array<{ productId: string; qty: number }>;
}

class PayOrderDto {
  @IsString() method!: string;
  @IsOptional() @IsString() reference?: string;
}

class SubmitReviewDto {
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @IsString() reviewText?: string;
}

class PayForServiceDto {
  @IsInt() @Min(1) amount!: number;
  @IsString() method!: string;
  @IsOptional() @IsString() reference?: string;
}

class UpdateDoctorDto {
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() shift?: string;
  @IsOptional() @IsInt() @Min(0) @Max(5) rating?: number;
  @IsOptional() @IsString() bio?: string;
  @IsOptional() @IsString() imageUrl?: string;
}

class CreatePatientDto {
  @IsString() fullName!: string;
  @IsString() phone!: string;
  @IsOptional() @IsString() nationalId?: string;
  @IsOptional() @IsString() insurance?: string;
}

class RequestPaymentDto {
  @IsString() orderId!: string;
}

class VerifyPaymentDto {
  @IsString() authority!: string;
}

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClinicController {
  constructor(
    private readonly clinic: ClinicService,
    private readonly payments: PaymentService,
    private readonly audit: AuditService
  ) {}

  @Get('dashboard/summary')
  @Roles(...STAFF_ROLES)
  summary() {
    return this.clinic.dashboard();
  }

  @Get('patients')
  @Roles(...STAFF_ROLES)
  patients() {
    return this.clinic.patients();
  }

  @Get('patients/:id')
  async patient(@Param('id') id: string, @Req() req: AuthedRequest) {
    const patient = await this.clinic.patientById(id);
    if (!patient) throw new NotFoundException('بیمار پیدا نشد.');
    // A patient may only read their own record; staff may read any.
    if (req.user.role === Role.PATIENT && patient.userId !== req.user.sub) {
      throw new ForbiddenException('دسترسی به این پرونده مجاز نیست.');
    }
    return patient;
  }

  @Post('patients')
  @Roles(...STAFF_ROLES)
  async createPatient(@Body() body: CreatePatientDto, @Req() req: AuthedRequest) {
    const created = await this.clinic.createPatient(body);
    await this.audit.log({ actorId: req.user.sub, actorRole: req.user.role, action: 'patient.create', entity: 'Patient', entityId: created.id });
    return created;
  }

  @Patch('patients/:id')
  @Roles(...STAFF_ROLES)
  async updatePatient(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: AuthedRequest) {
    const updated = await this.clinic.updatePatient(id, body);
    await this.audit.log({ actorId: req.user.sub, actorRole: req.user.role, action: 'patient.update', entity: 'Patient', entityId: id });
    return updated;
  }

  @Get('appointments')
  @Roles(...STAFF_ROLES)
  async appointments() {
    const list = await this.clinic.appointments();
    // (#7) attribute each appointment to whichever staff profile last acted on it.
    const actors = await this.audit.latestActorsFor('Appointment', list.map((a) => a.id));
    return list.map((a) => ({ ...a, handledBy: actors.get(a.id) ?? null }));
  }

  @Get('doctors')
  @Public()
  doctors() {
    return this.clinic.doctors();
  }

  @Get('doctors/:id/profile')
  @Public()
  doctorProfile(@Param('id') id: string) {
    return this.clinic.doctorProfile(id);
  }

  @Get('staff/doctors')
  @Roles(...STAFF_ROLES)
  staffDoctors() {
    return this.clinic.staffDoctors();
  }

  @Get('staff/users')
  @Roles(Role.ADMIN)
  staffUsers() {
    return this.clinic.staffUsers();
  }

  @Patch('staff/doctors/:id')
  @Roles(...STAFF_ROLES)
  async updateDoctor(@Param('id') id: string, @Body() body: UpdateDoctorDto, @Req() req: AuthedRequest) {
    const updated = await this.clinic.updateDoctor(id, body);
    await this.audit.log({ actorId: req.user.sub, actorRole: req.user.role, action: 'doctor.update', entity: 'StaffProfile', entityId: id, meta: body });
    return updated;
  }

  @Get('top-patients')
  @Roles(...STAFF_ROLES)
  topPatients() {
    return this.clinic.topPatients();
  }

  @Get('finance/report')
  @Roles(...STAFF_ROLES)
  financeReport() {
    return this.clinic.financeReport();
  }

  @Post('appointments')
  async createAppointment(@Body() body: CreateAppointmentDto, @Req() req: AuthedRequest) {
    // Patients may only book for themselves; staff may book for any patient.
    if (req.user.role === Role.PATIENT) {
      const ownerId = await this.clinic.patientUserId(body.patientId);
      if (ownerId !== req.user.sub) {
        throw new ForbiddenException('فقط می‌توانید برای حساب خودتان نوبت ثبت کنید.');
      }
    }
    return this.clinic.createAppointment(body);
  }

  @Patch('appointments/:id/status')
  @Roles(...STAFF_ROLES)
  async updateAppointmentStatus(
    @Param('id') id: string,
    @Body() body: { status: AppointmentStatus; cancelReason?: string },
    @Req() req: AuthedRequest
  ) {
    const updated = await this.clinic.updateAppointmentStatus(id, body.status, body.cancelReason);
    await this.audit.log({
      actorId: req.user.sub,
      actorRole: req.user.role,
      action: 'appointment.status',
      entity: 'Appointment',
      entityId: id,
      meta: { status: body.status }
    });
    return updated;
  }

  @Patch('appointments/:id/review')
  async submitReview(@Param('id') id: string, @Body() body: SubmitReviewDto, @Req() req: AuthedRequest) {
    return this.clinic.submitReview(id, req.user.sub, body.rating, body.reviewText);
  }

  @Get('reviews')
  @Roles(...STAFF_ROLES)
  reviews(@Query('doctorId') doctorId?: string) {
    return this.clinic.doctorReviews(doctorId);
  }

  @Get('service-history')
  @Roles(...STAFF_ROLES)
  serviceHistory(@Query('from') from: string, @Query('to') to: string) {
    const fromDate = from ? new Date(from) : new Date(0);
    const toDate = to ? new Date(to) : new Date();
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('بازه‌ی تاریخ نامعتبر است.');
    }
    return this.clinic.serviceHistory(fromDate, toDate);
  }

  @Post('records')
  @Roles(...STAFF_ROLES)
  async createRecord(@Body() body: CreateRecordDto, @Req() req: AuthedRequest) {
    const record = await this.clinic.medicalRecordCreate(body);
    await this.audit.log({ actorId: req.user.sub, actorRole: req.user.role, action: 'record.create', entity: 'MedicalRecord', entityId: body.patientId, meta: { title: body.title } });
    return record;
  }

  @Get('audit')
  @Roles(...STAFF_ROLES)
  auditLog() {
    return this.audit.recent();
  }

  /** Upload an image (medical-record attachment). Returns a relative URL stored in images[]. */
  @Post('uploads')
  @Roles(...STAFF_ROLES)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async upload(@UploadedFile() file?: UploadedImage) {
    if (!file) throw new BadRequestException('فایلی ارسال نشد.');
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('فقط فایل تصویری مجاز است.');
    }
    await mkdir(UPLOAD_DIR, { recursive: true });
    const ext = (file.originalname.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? '.bin').toLowerCase();
    const name = `${Date.now()}-${randomUUID()}${ext}`;
    await writeFile(join(UPLOAD_DIR, name), file.buffer);
    return { url: `/uploads/${name}` };
  }

  @Get('products')
  @Public()
  products() {
    return this.clinic.products();
  }

  @Post('orders')
  async createOrder(@Body() body: CreateOrderDto, @Req() req: AuthedRequest) {
    if (req.user.role === Role.PATIENT) {
      const ownerId = await this.clinic.patientUserId(body.patientId);
      if (ownerId !== req.user.sub) {
        throw new ForbiddenException('فقط می‌توانید برای حساب خودتان سفارش ثبت کنید.');
      }
    }
    return this.clinic.createOrder(body.patientId, body.items);
  }

  @Post('orders/:id/pay')
  payOrder(@Param('id') id: string, @Body() body: PayOrderDto) {
    return this.clinic.payOrder(id, body.method, body.reference);
  }

  @Post('payments/request')
  async requestPayment(@Body() body: RequestPaymentDto, @Req() req: AuthedRequest) {
    if (req.user.role === Role.PATIENT) {
      const owner = await this.clinic.orderOwnerUserId(body.orderId);
      if (owner !== req.user.sub) throw new ForbiddenException('دسترسی به این سفارش مجاز نیست.');
    }
    return this.payments.requestOrderPayment(body.orderId);
  }

  @Post('payments/verify')
  async verifyPayment(@Body() body: VerifyPaymentDto, @Req() req: AuthedRequest) {
    const result = await this.payments.verifyOrderPayment(body.authority);
    await this.audit.log({
      actorId: req.user.sub,
      actorRole: req.user.role,
      action: 'payment.verify',
      entity: 'Order',
      entityId: result.orderId ?? undefined,
      meta: { ok: result.ok }
    });
    return result;
  }

  @Get('orders/:id/invoice')
  async invoice(@Param('id') id: string, @Req() req: AuthedRequest) {
    const order = await this.payments.orderInvoice(id);
    if (req.user.role === Role.PATIENT && order.patient?.userId !== req.user.sub) {
      throw new ForbiddenException('دسترسی به این فاکتور مجاز نیست.');
    }
    return order;
  }

  @Post('appointments/:id/pay')
  @Roles(...STAFF_ROLES)
  async payForService(
    @Param('id') id: string,
    @Body() body: PayForServiceDto,
    @Req() req: AuthedRequest
  ) {
    const payment = await this.clinic.payForService(id, body.amount, body.method, body.reference);
    await this.audit.log({
      actorId: req.user.sub,
      actorRole: req.user.role,
      action: 'appointment.pay',
      entity: 'Appointment',
      entityId: id,
      meta: { amount: body.amount, method: body.method }
    });
    return payment;
  }

  @Get('appointments/:id/invoice')
  async serviceInvoice(@Param('id') id: string, @Req() req: AuthedRequest) {
    const appointment = await this.clinic.serviceInvoice(id);
    if (req.user.role === Role.PATIENT && appointment.patient.userId !== req.user.sub) {
      throw new ForbiddenException('دسترسی به این فاکتور مجاز نیست.');
    }
    return appointment;
  }

  @Get('tickets')
  @Roles(...STAFF_ROLES)
  tickets(@Query('role') role?: Role) {
    return this.clinic.tickets(role);
  }

  @Post('tickets')
  createTicket(@Body() body: CreateTicketDto, @Req() req: AuthedRequest) {
    // A patient can only send tickets as themselves.
    if (req.user.role === Role.PATIENT && body.senderUserId !== req.user.sub) {
      throw new ForbiddenException('ارسال‌کننده‌ی نامعتبر.');
    }
    return this.clinic.createTicket(body);
  }
}
