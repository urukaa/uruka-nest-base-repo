import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthProvider } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/common/prisma.service';
import { describeWithDb } from './db';

const USERNAME = `spec_${Date.now()}`;
const PASSWORD = 'super-secret-8';

// Cast to these rather than `any`: an `as any` is stripped as redundant by
// --fix, which then trips no-unsafe-member-access on every field read.
type AuthBody = {
  user: Record<string, unknown> & { username: string; role: string };
  accessToken: string;
  refreshToken: string;
};

type ErrorBody = { message: string };

// Real SQL on purpose: the unique constraint, the upsert and the cascade are
// the behaviour under test, and a mocked client would assert nothing about them.
describeWithDb('Auth (local)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let refreshToken: string;

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
      where: { username: { startsWith: 'spec_' } },
    });
    await app.close();
  });

  describe('POST /api/auth/register', () => {
    it('creates a user and returns a token pair', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ username: USERNAME, password: PASSWORD, name: 'Spec User' })
        .expect(201);

      const body = res.body as AuthBody;

      expect(body.user).toMatchObject({
        username: USERNAME,
        role: 'USER',
        provider: AuthProvider.LOCAL,
      });
      expect(typeof body.accessToken).toBe('string');
      expect(typeof body.refreshToken).toBe('string');

      refreshToken = body.refreshToken;
    });

    it('never returns the password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ username: `spec_leak_${Date.now()}`, password: PASSWORD });

      expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
      expect((res.body as AuthBody).user).not.toHaveProperty('password');
    });

    it('rejects a duplicate username with 409', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ username: USERNAME, password: PASSWORD })
        .expect(409);
    });

    it("rejects a password over bcrypt's 72-byte limit", async () => {
      // Without this check bcrypt would silently truncate, making every
      // password sharing the first 72 bytes equivalent.
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ username: `spec_long_${Date.now()}`, password: 'a'.repeat(73) })
        .expect(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('returns a token pair for valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: USERNAME, password: PASSWORD })
        .expect(200);

      expect(typeof (res.body as AuthBody).accessToken).toBe('string');
    });

    it('gives the same answer for a wrong password and an unknown user', async () => {
      const wrongPassword = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: USERNAME, password: 'not-the-password' })
        .expect(401);

      const unknownUser = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'spec_nobody_here', password: PASSWORD })
        .expect(401);

      // Differing messages would turn this endpoint into a username oracle.
      expect((wrongPassword.body as ErrorBody).message).toBe(
        (unknownUser.body as ErrorBody).message,
      );
    });
  });

  describe('GET /api/auth/me', () => {
    it('rejects a request with no token', async () => {
      await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    });

    it('returns the caller when the access token is valid', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: USERNAME, password: PASSWORD });

      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${(login.body as AuthBody).accessToken}`)
        .expect(200);

      expect(res.body).toMatchObject({ username: USERNAME, role: 'USER' });
    });
  });

  describe('refresh tokens', () => {
    it('stores only a hash, never the token itself', async () => {
      const row = await prisma.refreshToken.findUnique({
        where: { tokenHash: AuthService.hashRefreshToken(refreshToken) },
      });

      expect(row).not.toBeNull();

      const raw = await prisma.refreshToken.findFirst({
        where: { tokenHash: refreshToken },
      });

      expect(raw).toBeNull();
    });
  });

  describe('linkExternalUser (provider seam)', () => {
    it('provisions a provider-backed user with no password', async () => {
      const auth = app.get(AuthService);
      const externalId = `clerk_${Date.now()}`;

      const user = await auth.linkExternalUser({
        provider: AuthProvider.CLERK,
        externalId,
        username: `spec_ext_${Date.now()}`,
        name: 'External User',
      });

      expect(user.provider).toBe(AuthProvider.CLERK);

      const stored = await prisma.user.findUnique({
        where: { externalId },
        select: { password: true },
      });

      expect(stored?.password).toBeNull();
    });

    it('is idempotent — a second login updates rather than duplicates', async () => {
      const auth = app.get(AuthService);
      const externalId = `clerk_same_${Date.now()}`;
      const username = `spec_ext_same_${Date.now()}`;

      const first = await auth.linkExternalUser({
        provider: AuthProvider.CLERK,
        externalId,
        username,
      });

      const second = await auth.linkExternalUser({
        provider: AuthProvider.CLERK,
        externalId,
        username,
        name: 'Renamed',
      });

      expect(second.id).toBe(first.id);
      expect(second.name).toBe('Renamed');
    });

    it('leaves an external account unusable for local login', async () => {
      const externalId = `clerk_nologin_${Date.now()}`;
      const username = `spec_ext_nologin_${Date.now()}`;

      await app.get(AuthService).linkExternalUser({
        provider: AuthProvider.CLERK,
        externalId,
        username,
      });

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username, password: PASSWORD })
        .expect(401);
    });
  });
});
