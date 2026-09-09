import { Test, TestingModule } from '@nestjs/testing';
import { AuthProvider } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { RefreshTokenCleanupService } from '../src/auth/refresh-token-cleanup.service';
import { PrismaService } from '../src/common/prisma.service';
import { describeWithDb } from './db';

describeWithDb('RefreshTokenCleanupService', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let cleanup: RefreshTokenCleanupService;
  let userId: number;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    cleanup = moduleRef.get(RefreshTokenCleanupService);

    const user = await prisma.user.create({
      data: {
        username: `cspec_${Date.now()}`,
        provider: AuthProvider.LOCAL,
        password: 'irrelevant',
      },
      select: { id: true },
    });

    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { username: { startsWith: 'cspec_' } },
    });

    // close(), not $disconnect(): ScheduleModule registers cron timers, and
    // leaving them running keeps the Jest worker alive after the suite ends.
    await moduleRef.close();
  });

  const seed = (
    label: string,
    expiresAt: Date,
    revokedAt: Date | null = null,
  ) =>
    prisma.refreshToken.create({
      data: {
        tokenHash: AuthService.hashRefreshToken(`${label}_${Date.now()}`),
        userId,
        expiresAt,
        revokedAt,
      },
      select: { id: true },
    });

  const hour = 60 * 60 * 1000;

  it('removes expired rows and leaves live ones', async () => {
    const expired = await seed('expired', new Date(Date.now() - hour));
    const live = await seed('live', new Date(Date.now() + hour));

    await cleanup.removeExpired();

    expect(
      await prisma.refreshToken.findUnique({ where: { id: expired.id } }),
    ).toBeNull();
    expect(
      await prisma.refreshToken.findUnique({ where: { id: live.id } }),
    ).not.toBeNull();
  });

  it('keeps a revoked row until it actually expires', async () => {
    // Reuse detection depends on finding the revoked row. Deleting it early
    // would downgrade a replay from "revoke every session" to a plain 401.
    const revokedButLive = await seed(
      'revoked',
      new Date(Date.now() + hour),
      new Date(),
    );

    await cleanup.removeExpired();

    expect(
      await prisma.refreshToken.findUnique({
        where: { id: revokedButLive.id },
      }),
    ).not.toBeNull();
  });

  it('reports how many rows it removed', async () => {
    await seed('count_a', new Date(Date.now() - hour));
    await seed('count_b', new Date(Date.now() - hour));

    expect(await cleanup.removeExpired()).toBeGreaterThanOrEqual(2);
  });
});
