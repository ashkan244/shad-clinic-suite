import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Appointment } from '@prisma/client';
import { Queue } from 'bullmq';

export const REMINDERS_QUEUE = 'reminders';

export type ReminderJobData = { appointmentId: string; lead: '24h' | '1h' };

/** Two reminder leads: (ه) a day before, (ج) an hour before. */
const REMINDER_LEADS_MS: Record<'24h' | '1h', number> = {
  '24h': 24 * 60 * 60 * 1000,
  '1h': 60 * 60 * 1000
};

/**
 * Schedules appointment reminders on the shared Redis-backed BullMQ queue.
 * A delayed job is enqueued per appointment; the worker (RemindersProcessor)
 * fires it and dispatches the reminder through NotificationsService.
 */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(@InjectQueue(REMINDERS_QUEUE) private readonly queue: Queue<ReminderJobData>) {}

  private jobId(appointmentId: string, lead: '24h' | '1h') {
    return `reminder:${lead}:${appointmentId}`;
  }

  async schedule(appointment: Appointment) {
    const when = this.parseAppointmentTime(appointment.date, appointment.time);
    if (!when) {
      this.logger.warn(
        `Cannot parse appointment time (${appointment.date} ${appointment.time}); reminder skipped`
      );
      return;
    }
    if (when.getTime() <= Date.now()) return; // appointment already in the past

    await Promise.all(
      (['24h', '1h'] as const).map((lead) => this.scheduleLead(appointment.id, when, lead))
    );
  }

  private async scheduleLead(appointmentId: string, when: Date, lead: '24h' | '1h') {
    try {
      const delay = when.getTime() - REMINDER_LEADS_MS[lead] - Date.now();
      if (delay < 0) return; // this lead window has already passed
      const jobId = this.jobId(appointmentId, lead);
      // Replace any existing reminder for this appointment (e.g. on reschedule).
      await this.queue.remove(jobId).catch(() => undefined);
      await this.queue.add(
        'appointment-reminder',
        { appointmentId, lead },
        { jobId, delay, removeOnComplete: true, removeOnFail: 100 }
      );
      this.logger.log(`Reminder (${lead}) scheduled for appointment ${appointmentId} (delay ${Math.round(delay / 1000)}s)`);
    } catch (err) {
      this.logger.warn(`Failed to schedule ${lead} reminder for ${appointmentId}: ${String(err)}`);
    }
  }

  async cancel(appointmentId: string) {
    await Promise.all(
      (['24h', '1h'] as const).map((lead) =>
        this.queue.remove(this.jobId(appointmentId, lead)).catch(() => undefined)
      )
    );
  }

  private parseAppointmentTime(date: string, time: string): Date | null {
    const normalizedTime = (time || '00:00').slice(0, 5).padStart(5, '0');
    const parsed = new Date(`${date}T${normalizedTime}:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
