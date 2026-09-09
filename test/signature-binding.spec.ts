import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as crypto from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

const APP_KEY = 'binding-key';
const APP_SECRET = 'binding-secret';
const APP_NAME = 'binding-app';
const USER_AGENT = 'PostmanRuntime/7.0.0';

const sha256 = (value: string) =>
  crypto.createHash('sha256').update(value).digest('hex');

function sign(
  method: string,
  path: string,
  timestamp: string,
  body = '',
): string {
  const canonical = [
    method.toUpperCase(),
    path,
    timestamp,
    APP_NAME,
    sha256(body),
  ].join('\n');

  return crypto
    .createHmac('sha256', APP_SECRET)
    .update(canonical)
    .digest('hex');
}

describe('Signature binding', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    Object.assign(process.env, {
      IS_VO1D_TESTING: 'mboten', // enforcement on
      APP_KEY,
      APP_SECRET,
      APP_NAME,
      ALLOWED_IPS: '127.0.0.1,::1',
      APP_KEY_PREVIOUS: '',
      APP_SECRET_PREVIOUS: '',
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: jest.fn().mockResolvedValue([{ '1': 1 }]) })
      .compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
  });

  afterAll(async () => {
    process.env.IS_VO1D_TESTING = 'nggih';
    await app.close();
  });

  const send = (
    method: 'get' | 'post',
    path: string,
    signature: string,
    timestamp: string,
    body?: object,
  ) => {
    const req = request(app.getHttpServer())
      [method](path)
      .set('User-Agent', USER_AGENT)
      .set('x-app-key', APP_KEY)
      .set('x-timestamp', timestamp)
      .set('x-signature', signature);

    return body ? req.send(body) : req;
  };

  // 404 rather than 200: the middleware passed and routing found no handler.
  const ACCEPTED = 404;
  const REJECTED = 403;

  it('accepts a correctly bound signature', async () => {
    const timestamp = new Date().toISOString();

    await send(
      'get',
      '/api/example',
      sign('GET', '/api/example', timestamp),
      timestamp,
    ).expect(ACCEPTED);
  });

  it('rejects a signature minted for a different path', async () => {
    const timestamp = new Date().toISOString();

    // The point of the whole change. Before binding, this succeeded — one
    // captured signature was a key to every endpoint for the whole window.
    await send(
      'get',
      '/api/example',
      sign('GET', '/api/somewhere-else', timestamp),
      timestamp,
    ).expect(REJECTED);
  });

  it('rejects a signature minted for a different method', async () => {
    const timestamp = new Date().toISOString();

    await send(
      'post',
      '/api/example',
      sign('GET', '/api/example', timestamp),
      timestamp,
    ).expect(REJECTED);
  });

  it('accepts a body that matches the hash it was signed with', async () => {
    const timestamp = new Date().toISOString();
    const body = { name: 'gento' };
    const raw = JSON.stringify(body);

    await send(
      'post',
      '/api/example',
      sign('POST', '/api/example', timestamp, raw),
      timestamp,
      body,
    ).expect(ACCEPTED);
  });

  it('rejects a body swapped after signing', async () => {
    const timestamp = new Date().toISOString();
    const signed = JSON.stringify({ amount: 10 });

    await send(
      'post',
      '/api/example',
      sign('POST', '/api/example', timestamp, signed),
      timestamp,
      { amount: 1000000 }, // tampered in flight
    ).expect(REJECTED);
  });

  it('ignores the query string, as the server does', async () => {
    const timestamp = new Date().toISOString();

    // The middleware strips the query before building the canonical string,
    // so a client must sign the bare path or nothing would ever match.
    await send(
      'get',
      '/api/example?page=2',
      sign('GET', '/api/example', timestamp),
      timestamp,
    ).expect(ACCEPTED);
  });

  it('hashes the empty string when there is no body', async () => {
    const timestamp = new Date().toISOString();

    expect(sha256('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );

    await send(
      'get',
      '/api/example',
      sign('GET', '/api/example', timestamp),
      timestamp,
    ).expect(ACCEPTED);
  });
});
