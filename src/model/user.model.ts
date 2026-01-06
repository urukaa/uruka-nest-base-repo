import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserResponse {
  id?: number;
  //   name: string;
  username: string;
  role: string;
  //   email?: string;
  token?: string;
  //   avatar?: string | null;
}

export class jwtPayload {
  userId: number;
  username: string;
}

export class RegisterUserReq {
  @ApiProperty({ example: 'gento' })
  username: string;

  @ApiProperty({ example: '12345678' })
  password: string;

  @ApiPropertyOptional({
    example: 'ADMIN',
    enum: ['ADMIN', 'USER'],
  })
  role: 'ADMIN' | 'USER';

  @ApiPropertyOptional({ type: 'string', format: 'binary' })
  avatar?: any;

  @ApiProperty({ example: 'gento led' })
  name: string;
}

export class LoginUserReq {
  @ApiProperty({ example: 'gento' })
  username: string;

  @ApiProperty({ example: '12345678' })
  password: string;
}

export class UpdateUserReq {
  @ApiPropertyOptional({ example: 'gentoled' })
  name?: string;
}

export class changePasswordReq {
  @ApiPropertyOptional({ example: '' })
  oldPassword: string;

  @ApiPropertyOptional({ example: '' })
  newPassword: string;
}
