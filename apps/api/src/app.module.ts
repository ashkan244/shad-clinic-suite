import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { LoggerModule } from 'nestjs-pino';
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
      secret: process.env.JWT_SECRET || 'dev-secret',
      signOptions: { expiresIn: '7d' }
    }),
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
