import { Injectable, Logger } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from './prisma.service.js';

export type AuditEntry = {
  actorId?: string;
  actorRole?: Role;
  action: string;
  entity: string;
  entityId?: string;
  meta?: unknown;
};

/** Records an immutable trail of sensitive operations. Writes never block the request. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId,
          actorRole: entry.actorRole,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId,
          meta: entry.meta === undefined ? undefined : JSON.stringify(entry.meta)
        }
      });
    } catch (err) {
      this.logger.warn(`audit log failed (${entry.action}): ${String(err)}`);
    }
  }

  recent(limit = 60) {
    return this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  }

  /**
   * (#7) Who last touched each of these entities — e.g. which reception
   * profile approved/attended an appointment — so the UI can print it next
   * to the record instead of burying it in a separate audit page.
   */
  async latestActorsFor(entity: string, entityIds: string[]): Promise<Map<string, { fullName: string; role: string }>> {
    const result = new Map<string, { fullName: string; role: string }>();
    if (entityIds.length === 0) return result;
    try {
      const logs = await this.prisma.auditLog.findMany({
        where: { entity, entityId: { in: entityIds }, actorId: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: { entityId: true, actorId: true, actorRole: true }
      });
      const actorIds = [...new Set(logs.map((l) => l.actorId!).filter(Boolean))];
      const actors = await this.prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, fullName: true }
      });
      const nameById = new Map(actors.map((a) => [a.id, a.fullName]));
      for (const log of logs) {
        if (!log.entityId || result.has(log.entityId)) continue; // keep the most recent only
        const fullName = log.actorId ? nameById.get(log.actorId) : undefined;
        if (fullName) result.set(log.entityId, { fullName, role: log.actorRole ?? '' });
      }
      return result;
    } catch (err) {
      this.logger.warn(`latestActorsFor(${entity}) failed: ${String(err)}`);
      return result;
    }
  }
}
