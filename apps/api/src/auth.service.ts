import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { PrismaService } from './prisma.service.js';
import { NotificationsService } from './notifications.service.js';
import { isValidNationalId } from './national-id.js';

type LoginInput = {
  nationalId: string;
  password: string;
};

type StaffLoginInput = {
  phone: string;
  password: string;
  role: Role;
};

type RegisterInput = {
  fullName: string;
  phone: string;
  nationalId: string;
  insurance?: string;
  password: string;
};

@Injectable()
export class AuthService {
  // (#10) In-memory OTP store: nationalId -> pending code. Fine for a single
  // Node process (matches this codebase's "mock provider" dev-scale approach);
  // a multi-instance production deployment should move this to Redis (already
  // used for BullMQ) with the same TTL semantics.
  private readonly otpStore = new Map<string, { code: string; userId: string; expiresAt: number; sentAt: number; attempts: number }>();
  private static readonly OTP_TTL_MS = 5 * 60 * 1000;
  /** Minimum gap between two codes for the same national ID (stops SMS bombing). */
  private static readonly OTP_RESEND_MS = 60 * 1000;
  /** Wrong guesses allowed before the code is burned (stops brute force). */
  private static readonly OTP_MAX_ATTEMPTS = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly notifications: NotificationsService
  ) {}

  private sign(user: { id: string; role: Role; phone: string; fullName: string }) {
    return {
      accessToken: this.jwt.sign({
        sub: user.id,
        role: user.role,
        phone: user.phone,
        fullName: user.fullName
      })
    };
  }

  async registerPatient(input: RegisterInput) {
    if (!isValidNationalId(input.nationalId)) {
      throw new BadRequestException('کد ملی نامعتبر است.');
    }
    const existing = await this.prisma.user.findUnique({ where: { phone: input.phone } });
    if (existing) {
      throw new BadRequestException('این شماره قبلاً ثبت شده است.');
    }
    const takenId = await this.prisma.patient.findUnique({ where: { nationalId: input.nationalId } });
    if (takenId) {
      throw new BadRequestException('این کد ملی قبلاً ثبت شده است.');
    }

    const user = await this.prisma.user.create({
      data: {
        role: Role.PATIENT,
        phone: input.phone,
        fullName: input.fullName,
        passwordHash: await bcrypt.hash(input.password, 10),
        patient: {
          create: {
            nationalId: input.nationalId,
            insurance: input.insurance
          }
        }
      },
      include: { patient: true }
    });

    // (الف) Welcome SMS on registration — best-effort, never blocks signup.
    this.notifications
      .notify({
        userId: user.id,
        patientId: user.patient?.id,
        title: 'خوش‌آمدید',
        body: `${input.fullName} عزیز، به کلینیک شاد خوش آمدید. ثبت‌نام شما با موفقیت انجام شد.`
      })
      .catch(() => undefined);

    return {
      ...this.sign(user),
      user: this.sanitizeUser(user)
    };
  }

  async loginPatient(input: LoginInput) {
    const patient = await this.prisma.patient.findUnique({
      where: { nationalId: input.nationalId },
      include: { user: { include: { patient: true, staffProfile: true } } }
    });
    const user = patient?.user;
    if (!user || !user.passwordHash || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException('کد ملی یا رمز عبور اشتباه است.');
    }
    return {
      ...this.sign(user),
      user: this.sanitizeUser(user)
    };
  }

  async loginStaff(input: StaffLoginInput) {
    const user = await this.prisma.user.findUnique({
      where: { phone: input.phone },
      include: { staffProfile: true }
    });
    if (!user || user.role !== input.role || !user.passwordHash || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException('دسترسی نامعتبر است.');
    }
    return {
      ...this.sign(user),
      user: this.sanitizeUser(user)
    };
  }

  /**
   * (#10) Step 1 of "login once with a password, then just your national ID":
   * texts a one-time code to the phone on file for that national ID. Always
   * responds the same way whether or not the ID matched a patient, so the
   * endpoint can't be used to enumerate registered national IDs.
   */
  async requestNationalIdOtp(nationalId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { nationalId } });
    const pending = this.otpStore.get(nationalId);
    if (patient && !(pending && Date.now() - pending.sentAt < AuthService.OTP_RESEND_MS)) {
      const code = String(randomInt(100_000, 1_000_000));
      const now = Date.now();
      this.otpStore.set(nationalId, { code, userId: patient.userId, expiresAt: now + AuthService.OTP_TTL_MS, sentAt: now, attempts: 0 });
      this.notifications
        .notify({
          userId: patient.userId,
          patientId: patient.id,
          title: 'کد ورود',
          body: `کد ورود شما به کلینیک شاد: ${code} (اعتبار ۵ دقیقه)`
        })
        .catch(() => undefined);
    }
    return { ok: true };
  }

  /** (#10) Step 2: verify the code and sign in exactly like a password login. */
  async verifyNationalIdOtp(nationalId: string, code: string) {
    const entry = this.otpStore.get(nationalId);
    if (!entry || entry.expiresAt < Date.now() || entry.code !== code) {
      if (entry && ++entry.attempts >= AuthService.OTP_MAX_ATTEMPTS) this.otpStore.delete(nationalId);
      throw new UnauthorizedException('کد وارد شده نامعتبر یا منقضی شده است.');
    }
    this.otpStore.delete(nationalId);
    const user = await this.prisma.user.findUnique({
      where: { id: entry.userId },
      include: { patient: true, staffProfile: true }
    });
    if (!user) throw new UnauthorizedException('کاربر پیدا نشد.');
    return { ...this.sign(user), user: this.sanitizeUser(user) };
  }

  sanitizeUser<T extends { passwordHash: string | null; patient?: unknown; staffProfile?: unknown }>(user: T & Record<string, unknown>) {
    const { passwordHash, ...rest } = user;
    return rest;
  }

  /** Lets a logged-in user change their own password (requires the current one). */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('رمز عبور فعلی نادرست است.');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) }
    });
    return { ok: true };
  }

  /** Admin-only: reset another user's password without knowing the old one. */
  async adminResetPassword(targetUserId: string, newPassword: string) {
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new BadRequestException('کاربر پیدا نشد.');
    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) }
    });
    return { ok: true };
  }
}
