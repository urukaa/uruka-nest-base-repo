import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuthProvider, Role } from '@prisma/client';

// `!` throughout: these are transport shapes populated by the framework /
// validation layer, never constructed by hand, so strictPropertyInitialization
// has nothing to verify.

export class UserResponse {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'gento' })
  username!: string;

  @ApiPropertyOptional({ example: 'gento led' })
  name?: string | null;

  @ApiProperty({ example: 'USER', enum: ['ADMIN', 'USER'] })
  role!: Role;

  @ApiPropertyOptional({ example: null })
  avatar?: string | null;

  @ApiProperty({ example: 'LOCAL', enum: ['LOCAL', 'CLERK', 'GOOGLE'] })
  provider!: AuthProvider;
}

export class AuthResponseDto {
  @ApiProperty({ type: UserResponse })
  user!: UserResponse;

  @ApiProperty({ description: 'Short-lived. Send as `Authorization: Bearer`.' })
  accessToken!: string;

  @ApiProperty({
    description: 'Long-lived and revocable. Exchange at /refresh.',
  })
  refreshToken!: string;
}

// `role` and `avatar` are intentionally absent: accepting a role here would let
// any caller register themselves as ADMIN. Roles are assigned server-side, and
// avatars belong to a separate upload endpoint.
export class RegisterUserReq {
  @ApiProperty({ example: 'gento', minLength: 3, maxLength: 100 })
  username!: string;

  @ApiProperty({
    example: '12345678',
    minLength: 8,
    description: 'At most 72 bytes — bcrypt truncates beyond that.',
  })
  password!: string;

  @ApiPropertyOptional({ example: 'gento led', maxLength: 100 })
  name?: string;
}

export class LoginUserReq {
  @ApiProperty({ example: 'gento' })
  username!: string;

  @ApiProperty({ example: '12345678' })
  password!: string;
}

export class RefreshTokenReq {
  @ApiProperty({ description: 'The refreshToken returned by login/register.' })
  refreshToken!: string;
}

export class ExternalSessionReq {
  @ApiProperty({
    description:
      'A session token from the configured provider (Clerk, Auth0, …).',
  })
  token!: string;
}

export class UpdateUserReq {
  @ApiPropertyOptional({ example: 'gentoled' })
  name?: string;
}

export class changePasswordReq {
  @ApiPropertyOptional({ example: '' })
  oldPassword!: string;

  @ApiPropertyOptional({ example: '' })
  newPassword!: string;
}
