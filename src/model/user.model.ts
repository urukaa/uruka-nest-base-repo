import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';

// `!` throughout: these are transport shapes populated by the framework /
// validation layer, never constructed by hand, so strictPropertyInitialization
// has nothing to verify.
export class UserResponse {
  id?: number;
  username!: string;
  role!: Role;
  token?: string;
}

export class RegisterUserReq {
  @ApiProperty({ example: 'gento' })
  username!: string;

  @ApiProperty({ example: '12345678' })
  password!: string;

  @ApiPropertyOptional({
    example: 'ADMIN',
    enum: ['ADMIN', 'USER'],
  })
  role!: Role;

  @ApiPropertyOptional({ type: 'string', format: 'binary' })
  avatar?: unknown;

  @ApiProperty({ example: 'gento led' })
  name!: string;
}

export class LoginUserReq {
  @ApiProperty({ example: 'gento' })
  username!: string;

  @ApiProperty({ example: '12345678' })
  password!: string;
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
