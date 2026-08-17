import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/common/prisma.service';
import { describeWithDb } from './db';

const PASSWORD = 'super-secret-8';

type AuthBody = { accessToken: string; refreshToken: string };

describeWithDb('Auth (refresh & revocation)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  /** Fresh user per test so rotation chains never cross. */
  const newSession = async (): Promise<AuthBody & { username: string }> => {
    const username = `rspec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ username, password: PASSWORD })
      .expect(201);

    return { ...(res.body as AuthBody), username };
  };

  const refresh = (token: string) =>
    request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: token });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { username: { startsWith: 'rspec_' } },
    });
    await app.close();
  });

  it('exchanges a refresh token for a new pair', async () => {
    const session = await newSession();
    const res = await refresh(session.refreshToken).expect(200);
    const body = res.body as AuthBody;

    expect(typeof body.accessToken).toBe('string');
    expect(body.refreshToken).not.toBe(session.refreshToken);
  });

  it('rejects the old token once it has been rotated', async () => {
    const session = await newSession();
    await refresh(session.refreshToken).expect(200);

    // Rotation is what makes a captured token expire early; without this the
    // stolen copy would stay valid for the full 30 days.
    await refresh(session.refreshToken).expect(401);
  });

  it('revokes every session when a spent token is replayed', async () => {
    const session = await newSession();

    const rotated = (await refresh(session.refreshToken).expect(200))
      .body as AuthBody;

    // Replaying the spent token means a copy exists somewhere. Which holder is
    // the thief cannot be known, so both are logged out.
    await refresh(session.refreshToken).expect(401);

    // The token issued to the legitimate user is now dead too — that is the
    // intended trade, and the reason this is worth testing.
    await refresh(rotated.refreshToken).expect(401);
  });

  it('chains the rotation so the replacement is traceable', async () => {
    const session = await newSession();
    await refresh(session.refreshToken).expect(200);

    const spent = await prisma.refreshToken.findUnique({
      where: { tokenHash: AuthService.hashRefreshToken(session.refreshToken) },
    });

    expect(spent?.revokedAt).not.toBeNull();
    expect(spent?.replacedById).not.toBeNull();
  });

  it('rejects an expired refresh token', async () => {
    const session = await newSession();

    await prisma.refreshToken.update({
      where: { tokenHash: AuthService.hashRefreshToken(session.refreshToken) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await refresh(session.refreshToken).expect(401);
  });

  it('rejects a token that was never issued', async () => {
    await refresh('f'.repeat(64)).expect(401);
  });

  describe('logout', () => {
    it('kills the refresh token it is given', async () => {
      const session = await newSession();

      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .send({ refreshToken: session.refreshToken })
        .expect(204);

      await refresh(session.refreshToken).expect(401);
    });

    it('answers 204 for a token that does not exist', async () => {
      // A 404 here would tell an attacker which tokens are live.
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .send({ refreshToken: 'a'.repeat(64) })
        .expect(204);
    });

    it('logout-all ends every session for the caller', async () => {
      const session = await newSession();

      const second = (await refresh(session.refreshToken).expect(200))
        .body as AuthBody;

      await request(app.getHttpServer())
        .post('/api/auth/logout-all')
        .set('Authorization', `Bearer ${second.accessToken}`)
        .expect(204);

      await refresh(second.refreshToken).expect(401);
    });
  });
});
