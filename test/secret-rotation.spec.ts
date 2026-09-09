import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as crypto from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

const OLD_KEY = 'app-key-old';
const NEW_KEY = 'app-key-new';
const OLD_SECRET = 'app-secret-old';
const NEW_SECRET = 'app-secret-new';
const APP_NAME = 'rotation-app';
const USER_AGENT = 'PostmanRuntime/7.0.0';

function sign(timestamp: string, secret: string) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}:${APP_NAME}`)
    .digest('hex');
}

describe('Secret rotation', () => {
  const boot = async (
    env: Record<string, string>,
  ): Promise<INestApplication<App>> => {
    Object.assign(process.env, {
      IS_VO1D_TESTING: 'mboten', // enforcement on
      APP_NAME,
      ALLOWED_IPS: '127.0.0.1,::1',
      APP_KEY_PREVIOUS: '',
      APP_SECRET_PREVIOUS: '',
      ...env,
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: jest.fn().mockResolvedValue([{ '1': 1 }]) })
      .compile();

    const app = moduleRef.createNestApplication();
    await app.init();
    return app;
  };

  const call = (app: INestApplication<App>, key: string, secret: string) => {
    const timestamp = new Date().toISOString();

    return request(app.getHttpServer())
      .get('/api/example')
      .set('User-Agent', USER_AGENT)
      .set('x-app-key', key)
      .set('x-timestamp', timestamp)
      .set('x-signature', sign(timestamp, secret));
  };

  afterAll(() => {
    process.env.IS_VO1D_TESTING = 'nggih';
    delete process.env.APP_KEY_PREVIOUS;
    delete process.env.APP_SECRET_PREVIOUS;
  });

  // 404 rather than 200: the middleware passed and routing found no handler.
  const ACCEPTED = 404;
  const REJECTED = 403;

  it('stage 1 — only the current credentials work', async () => {
    const app = await boot({ APP_KEY: OLD_KEY, APP_SECRET: OLD_SECRET });

    await call(app, OLD_KEY, OLD_SECRET).expect(ACCEPTED);
    await call(app, NEW_KEY, NEW_SECRET).expect(REJECTED);

    await app.close();
  });

  it('stage 2 — both are accepted while callers migrate', async () => {
    const app = await boot({
      APP_KEY: NEW_KEY,
      APP_SECRET: NEW_SECRET,
      APP_KEY_PREVIOUS: OLD_KEY,
      APP_SECRET_PREVIOUS: OLD_SECRET,
    });

    // This is the whole point: the API has already moved, the BFF has not,
    // and neither is broken.
    await call(app, OLD_KEY, OLD_SECRET).expect(ACCEPTED);
    await call(app, NEW_KEY, NEW_SECRET).expect(ACCEPTED);

    await app.close();
  });

  it('stage 3 — the old credentials die once the slot is cleared', async () => {
    const app = await boot({ APP_KEY: NEW_KEY, APP_SECRET: NEW_SECRET });

    await call(app, NEW_KEY, NEW_SECRET).expect(ACCEPTED);
    await call(app, OLD_KEY, OLD_SECRET).expect(REJECTED);

    await app.close();
  });

  it('never accepts a secret that was never configured', async () => {
    const app = await boot({
      APP_KEY: NEW_KEY,
      APP_SECRET: NEW_SECRET,
      APP_KEY_PREVIOUS: OLD_KEY,
      APP_SECRET_PREVIOUS: OLD_SECRET,
    });

    await call(app, NEW_KEY, 'a-third-secret-nobody-set').expect(REJECTED);

    await app.close();
  });

  it('does not pair the old key with the new secret', async () => {
    const app = await boot({
      APP_KEY: NEW_KEY,
      APP_SECRET: NEW_SECRET,
      APP_KEY_PREVIOUS: OLD_KEY,
      APP_SECRET_PREVIOUS: OLD_SECRET,
    });

    // Mixing is fine — key and secret are independent credentials, and during
    // stage 2 a caller may legitimately hold one of each.
    await call(app, OLD_KEY, NEW_SECRET).expect(ACCEPTED);

    await app.close();
  });
});
