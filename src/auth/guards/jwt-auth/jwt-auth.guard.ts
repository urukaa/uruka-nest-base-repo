import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from 'src/common/prisma.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Jalankan verifikasi JWT lebih dulu
    const isAllowed = (await super.canActivate(context)) as boolean;
    if (!isAllowed) return false;

    const req = context.switchToHttp().getRequest();
    const token = req.headers.authorization?.split(' ')[1];

    // if (token) {
    //   const blacklisted = await this.prisma.tokenBlacklist.findFirst({
    //     where: { token },
    //   });

    //   if (blacklisted) {
    //     throw new UnauthorizedException('Token is blacklisted');
    //   }
    // }

    return true;
  }
}
