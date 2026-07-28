import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { NotificationsService } from './notifications.service.js';
import { PrismaService } from './prisma.service.js';
import { REMINDERS_QUEUE, ReminderJobData } from './reminders.service.js';

const ACTIVE_STATUSES: AppointmentStatus[] = [AppointmentStatus.PENDING, AppointmentStatus.APPROVED];

@Processor(REMINDERS_QUEUE)
export class RemindersProcessor extends WorkerHost {
  private readonly logger = new Logger(RemindersProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService
  ) {
    super();
  }

  async process(job: Job<ReminderJobData>) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: job.data.appointmentId },
      include: { patient: true }
    });
    // Only remind for appointments that are still active.
    if (!appointment?.patient || !ACTIVE_STATUSES.includes(appointment.status)) return;

    const when = `${appointment.service} در ${appointment.date} ساعت ${appointment.time}`;
    const title = job.data.lead === '1h' ? 'نوبت شما نزدیک است' : 'یادآوری نوبت';
    const body =
      job.data.lead === '1h'
        ? `یادآوری: نوبت شما تا یک ساعت دیگر است — ${when}.`
        : `یادآوری: نوبت شما فردا است — ${when}.`;

    await this.notifications.notify({
      userId: appointment.patient.userId,
      patientId: appointment.patientId,
      appointmentId: appointment.id,
      title,
      body
    });
  }
}
