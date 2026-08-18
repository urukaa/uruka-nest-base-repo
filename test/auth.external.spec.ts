import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthProvider } from '@prisma/client';
import { createServer, type Server } from 'http';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { AddressInfo } from 'net';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import { describeWithDb } from './db';

/**
 * A real RSA keypair and a real JWKS endpoint, both created here.
 *
 * That is what makes this worth running: every step a provider's token goes
 * through — remote key fetch, RS256 signature check, issuer, azp, claim
 * extraction — is exercised for real. Only the provider's hostname is ours.
 */
const KEY_ID = 'test-key-1';
const ISSUER = 'https://clerk.spec.test';
const AZP = 'https://app.spec.test';

type AuthBody = {
  user: { id: number; username: string; provider: AuthProvider };
  accessToken: string;
  refreshToken: string;
};

describeWithDb('Auth (external provider)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwksServer: Server;
  let sign: (
    claims: Record<string, unknown>,
    overrides?: { issuer?: string; expiresIn?: string },
  ) => Promise<string>;

  beforeAll(async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256', {
      extractable: true,
    });

    const jwk: JWK = {
      ...(await exportJWK(publicKey)),
      kid: KEY_ID,
      alg: 'RS256',
      use: 'sig',
    };

    jwksServer = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ keys: [jwk] }));
    });

    await new Promise<void>((resolve) =>
      jwksServer.listen(0, '127.0.0.1', resolve),
    );

    const { port } = jwksServer.address() as AddressInfo;

    sign = (claims, overrides = {}) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: KEY_ID })
        .setIssuer(overrides.issuer ?? ISSUER)
        .setIssuedAt()
        .setExpirationTime(overrides.expiresIn ?? '5m')
        .sign(privateKey);

    process.env.AUTH_EXTERNAL_JWKS_URL = `http://127.0.0.1:${port}/jwks`;
    process.env.AUTH_EXTERNAL_ISSUER = ISSUER;
    process.env.AUTH_EXTERNAL_AUTHORIZED_PARTIES = AZP;
    process.env.AUTH_EXTERNAL_USERNAME_CLAIM = 'email';
    process.env.AUTH_EXTERNAL_PROVIDER = AuthProvider.CLERK;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { username: { startsWith: 'espec_' } },
    });
    await app.close();
    await new Promise<void>((resolve) => jwksServer.close(() => resolve()));

    delete process.env.AUTH_EXTERNAL_JWKS_URL;
    delete process.env.AUTH_EXTERNAL_ISSUER;
    delete process.env.AUTH_EXTERNAL_AUTHORIZED_PARTIES;
  });

  const exchange = (token: string) =>
    request(app.getHttpServer())
      .post('/api/auth/external/session')
      .send({ token });

  const validClaims = (email: string) => ({
    sub: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    email,
    name: 'External Person',
    azp: AZP,
  });

  it('exchanges a provider token for our own session', async () => {
    const email = `espec_${Date.now()}@spec.test`;
    const res = await exchange(await sign(validClaims(email))).expect(200);
    const body = res.body as AuthBody;

    expect(body.user).toMatchObject({
      username: email,
      provider: AuthProvider.CLERK,
    });

    // The whole point of the exchange: what comes back is our token, not the
    // provider's. Nothing downstream ever sees Clerk again.
    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200);

    expect(me.body).toMatchObject({ username: email });
  });

  it('provisions the account without a password', async () => {
    const email = `espec_nopw_${Date.now()}@spec.test`;
    await exchange(await sign(validClaims(email))).expect(200);

    const stored = await prisma.user.findUnique({
      where: { username: email },
      select: { password: true, externalId: true },
    });

    expect(stored?.password).toBeNull();
    expect(stored?.externalId).not.toBeNull();
  });

  it('reuses the same row when the provider token is presented again', async () => {
    const email = `espec_same_${Date.now()}@spec.test`;
    const claims = validClaims(email);

    const first = (await exchange(await sign(claims)).expect(200))
      .body as AuthBody;
    const second = (await exchange(await sign(claims)).expect(200))
      .body as AuthBody;

    expect(second.user.id).toBe(first.user.id);
  });

  it('rejects a token from a different issuer', async () => {
    const claims = validClaims(`espec_iss_${Date.now()}@spec.test`);
    await exchange(
      await sign(claims, { issuer: 'https://evil.example' }),
    ).expect(401);
  });

  it('rejects a token minted for a different origin (azp)', async () => {
    // Without this check, a token issued for someone else's Clerk app would be
    // accepted here — the CSRF exposure Clerk's docs warn about.
    const claims = {
      ...validClaims(`espec_azp_${Date.now()}@spec.test`),
      azp: 'https://someone-elses-app.test',
    };

    await exchange(await sign(claims)).expect(401);
  });

  it('rejects an expired token', async () => {
    const claims = validClaims(`espec_exp_${Date.now()}@spec.test`);
    await exchange(await sign(claims, { expiresIn: '-1m' })).expect(401);
  });

  it('rejects a token signed by an unknown key', async () => {
    const other = await generateKeyPair('RS256', { extractable: true });

    const forged = await new SignJWT(
      validClaims(`espec_forged_${Date.now()}@spec.test`),
    )
      .setProtectedHeader({ alg: 'RS256', kid: KEY_ID })
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(other.privateKey);

    await exchange(forged).expect(401);
  });

  it('refuses rather than inventing a username when the claim is absent', async () => {
    // A default Clerk session token has no `email` — falling back to `sub`
    // would quietly fill the table with users named `user_2abc...`.
    const { email: _dropped, ...withoutEmail } =
      validClaims('unused@spec.test');

    const res = await exchange(await sign(withoutEmail)).expect(401);

    expect((res.body as { message: string }).message).toContain('email');
  });
});
