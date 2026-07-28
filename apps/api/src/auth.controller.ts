import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { Roles } from './auth.decorators.js';

type AuthedRequest = { user: { sub: string; role: Role } };

class RegisterPatientDto {
  @IsString() fullName!: string;
  @IsString() phone!: string;
  @IsOptional() @IsString() nationalId?: string;
  @IsOptional() @IsString() insurance?: string;
  @IsString() @MinLength(4) password!: string;
}

class LoginDto {
  @IsString() phone!: string;
  @IsString() @MinLength(4) password!: string;
}

class StaffLoginDto extends LoginDto {
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
  @IsString() nationalId!: string;
}

class OtpVerifyDto {
  @IsString() nationalId!: string;
  @IsString() code!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('patient/register')
  registerPatient(@Body() body: RegisterPatientDto) {
    return this.auth.registerPatient(body);
  }

  @Post('patient/login')
  loginPatient(@Body() body: LoginDto) {
    return this.auth.loginPatient(body);
  }

  @Post('staff/login')
  loginStaff(@Body() body: StaffLoginDto) {
    return this.auth.loginStaff({ ...body, role: body.role as Role });
  }

  @Post('patient/otp/request')
  requestOtp(@Body() body: OtpRequestDto) {
    return this.auth.requestNationalIdOtp(body.nationalId);
  }

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
