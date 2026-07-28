import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { SmsService } from './sms.service.js';

type NotifyInput = {
  userId: string;
  patientId?: string;
  appointmentId?: string;
  title: string;
  body: string;
  /** Delivery channel stored on the record. Defaults to "sms". */
  channel?: string;
  /** Override SMS dispatch. Defaults to true when channel is "sms". */
  sendSms?: boolean;
};

/**
 * Central entry point for user-facing notifications. Always persists a
 * Notification row (the in-app feed / audit trail) and optionally dispatches
 * an SMS through the pluggable SmsService.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService
  ) {}

  async notify(input: NotifyInput) {
    const channel = input.channel ?? 'sms';
    const record = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        patientId: input.patientId,
        appointmentId: input.appointmentId,
        title: input.title,
        body: input.body,
        channel
      }
    });

    const shouldSend = input.sendSms ?? channel === 'sms';
    if (shouldSend) {
      const user = await this.prisma.user.findUnique({ where: { id: input.userId } });
      if (user?.phone) {
        const result = await this.sms.send(user.phone, `${input.title}\n${input.body}`);
        if (!result.ok) {
          this.logger.warn(`SMS dispatch failed for notification ${record.id}: ${result.error}`);
        }
      } else {
        this.logger.warn(`No phone for user ${input.userId}; skipped SMS for notification ${record.id}`);
      }
    }

    return record;
  }

  listForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
  }

  markRead(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() }
    });
  }
}
