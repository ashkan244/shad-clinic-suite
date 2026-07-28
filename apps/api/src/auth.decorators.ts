import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

/** Marks a route as public — JwtAuthGuard will skip authentication. */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restricts a route to the given roles (enforced by RolesGuard). */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Staff roles allowed to manage clinic data. */
export const STAFF_ROLES = [Role.ADMIN, Role.RECEPTION, Role.DOCTOR] as const;
