import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { Roles } from './auth.decorators.js';
import { toDigits } from './national-id.js';

type AuthedRequest = { user: { sub: string; role: Role } };

class RegisterPatientDto {
  @IsString() fullName!: string;
  @Transform(toDigits) @IsString() phone!: string;
  @Transform(toDigits) @IsString() nationalId!: string;
  @IsOptional() @IsString() insurance?: string;
  @IsString() @MinLength(4) password!: string;
}

/** Patients sign in with their national ID (کد ملی) + password. */
class LoginDto {
  @Transform(toDigits) @IsString() nationalId!: string;
  @IsString() @MinLength(4) password!: string;
}

/** Staff have no national ID on file, so they keep signing in by phone. */
class StaffLoginDto {
  @Transform(toDigits) @IsString() phone!: string;
  @IsString() @MinLength(4) password!: string;
  @IsString() role!: Role;
}

class ChangePasswordDto {
  @IsString() currentPassword!: string;
  @IsString() @MinLength(4) newPassword!: string;
}

class AdminResetPasswordDto {
  @IsString() userId!: string;
  @IsString() @MinLength(4) newPassword!: string;
}

class OtpRequestDto {
  @Transform(toDigits) @IsString() nationalId!: string;
}

class OtpVerifyDto {
  @Transform(toDigits) @IsString() nationalId!: string;
  @Transform(toDigits) @IsString() code!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('patient/register')
  registerPatient(@Body() body: RegisterPatientDto) {
    return this.auth.registerPatient(body);
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('patient/login')
  loginPatient(@Body() body: LoginDto) {
    return this.auth.loginPatient(body);
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('staff/login')
  loginStaff(@Body() body: StaffLoginDto) {
    return this.auth.loginStaff({ ...body, role: body.role as Role });
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post('patient/otp/request')
  requestOtp(@Body() body: OtpRequestDto) {
    return this.auth.requestNationalIdOtp(body.nationalId);
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('patient/otp/verify')
  verifyOtp(@Body() body: OtpVerifyDto) {
    return this.auth.verifyNationalIdOtp(body.nationalId, body.code);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: { user: { sub: string } }) {
    return req.user;
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(@Req() req: AuthedRequest, @Body() body: ChangePasswordDto) {
    return this.auth.changePassword(req.user.sub, body.currentPassword, body.newPassword);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/reset-password')
  adminResetPassword(@Body() body: AdminResetPasswordDto) {
    return this.auth.adminResetPassword(body.userId, body.newPassword);
  }
}
