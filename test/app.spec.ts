import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/common/prisma.service';

describe('HealthycheckController ()', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    // The health check now queries the database, so it is stubbed here to keep
    // these route-level assertions independent of a running Postgres.
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: jest.fn().mockResolvedValue([{ '1': 1 }]) })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('/health (GET)', () => {
    it('should return status ok', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      expect((res.body as { status: string }).status).toBe('ok');
    });
  });

  describe('unknown routes', () => {
    it('returns the unified error envelope', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/does-not-exist')
        .expect(404);

      const body = res.body as Record<string, unknown>;

      expect(body).toMatchObject({
        statusCode: 404,
        path: '/api/does-not-exist',
      });
      expect(typeof body.message).toBe('string');
      expect(typeof body.timestamp).toBe('string');
    });
  });
});
