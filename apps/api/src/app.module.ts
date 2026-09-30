import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthController } from './auth.controller.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { ClinicController } from './clinic.controller.js';
import { PrismaService } from './prisma.service.js';
import { AuthService } from './auth.service.js';
import { ClinicService } from './clinic.service.js';
import { PaymentService } from './payment.service.js';
import { AuditService } from './audit.service.js';
import { SmsService } from './sms.service.js';
import { NotificationsService } from './notifications.service.js';
import { RemindersService, REMINDERS_QUEUE } from './reminders.service.js';
import { RemindersProcessor } from './reminders.processor.js';

/**
 * JWT signing key. In production a real secret is mandatory — booting with the
 * dev fallback or a placeholder would let anyone who reads the repo forge tokens.
 */
export function jwtSecret(env: NodeJS.ProcessEnv = process.env) {
  const secret = env.JWT_SECRET?.trim();
  if (env.NODE_ENV !== 'production') return secret || 'dev-secret';
  if (!secret || secret.length < 32 || /change-me|replace-me|dev-secret/i.test(secret)) {
    throw new Error('JWT_SECRET must be set to a random value of at least 32 characters in production (e.g. `openssl rand -hex 32`).');
  }
  return secret;
}

function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.password ? { password: url.password } : {}),
    ...(url.username ? { username: url.username } : {})
  };
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' }
      }
    }),
    JwtModule.register({
      global: true,
      secret: jwtSecret(),
      signOptions: { expiresIn: '7d' }
    }),
    // Limits are applied per-route (auth endpoints) via @Throttle + ThrottlerGuard.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 10 }]),
    BullModule.forRoot({ connection: redisConnection() }),
    BullModule.registerQueue({ name: REMINDERS_QUEUE })
  ],
  controllers: [AppController, AuthController, ClinicController],
  providers: [
    AppService,
    PrismaService,
    AuthService,
    ClinicService,
    PaymentService,
    AuditService,
    JwtAuthGuard,
    RolesGuard,
    SmsService,
    NotificationsService,
    RemindersService,
    RemindersProcessor
  ]
})
export class AppModule {}
