import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as crypto from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

const APP_KEY = 'test-app-key';
const APP_SECRET = 'test-app-secret';
const APP_NAME = 'test-app';
const USER_AGENT = 'PostmanRuntime/7.0.0';

function sign(timestamp: string) {
  return crypto
    .createHmac('sha256', APP_SECRET)
    .update(`${timestamp}:${APP_NAME}`)
    .digest('hex');
}

describe('SecurityMiddleware', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Turn enforcement on; the suite otherwise runs with the bypass enabled.
    process.env.IS_VO1D_TESTING = 'mboten';
    process.env.APP_KEY = APP_KEY;
    process.env.APP_SECRET = APP_SECRET;
    process.env.APP_NAME = APP_NAME;
    process.env.ALLOWED_IPS = '127.0.0.1,::1';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    process.env.IS_VO1D_TESTING = 'nggih';
    await app.close();
  });

  it('lets open paths through unsigned', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200);
  });

  it('rejects an unsigned request to a protected path', async () => {
    await request(app.getHttpServer()).get('/api/example').expect(403);
  });

  it('accepts a correctly signed request', async () => {
    const timestamp = new Date().toISOString();

    // 404 rather than 403: the middleware passed and routing found no handler.
    await request(app.getHttpServer())
      .get('/api/example')
      .set('User-Agent', USER_AGENT)
      .set('x-app-key', APP_KEY)
      .set('x-timestamp', timestamp)
      .set('x-signature', sign(timestamp))
      .expect(404);
  });

  it('rejects a tampered signature', async () => {
    const timestamp = new Date().toISOString();

    await request(app.getHttpServer())
      .get('/api/example')
      .set('User-Agent', USER_AGENT)
      .set('x-app-key', APP_KEY)
      .set('x-timestamp', timestamp)
      .set('x-signature', sign(timestamp).replace(/^./, 'f'))
      .expect(403);
  });

  it('rejects an expired timestamp', async () => {
    const timestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    await request(app.getHttpServer())
      .get('/api/example')
      .set('User-Agent', USER_AGENT)
      .set('x-app-key', APP_KEY)
      .set('x-timestamp', timestamp)
      .set('x-signature', sign(timestamp))
      .expect(403);
  });

  it('rejects a wrong app key', async () => {
    const timestamp = new Date().toISOString();

    await request(app.getHttpServer())
      .get('/api/example')
      .set('User-Agent', USER_AGENT)
      .set('x-app-key', 'nope')
      .set('x-timestamp', timestamp)
      .set('x-signature', sign(timestamp))
      .expect(403);
  });
});
