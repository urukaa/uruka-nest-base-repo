import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { PrismaService } from '../src/common/prisma.service';
import { HealthyCheckService } from '../src/healthy_check/healthycheck.service';

function build(queryRaw: jest.Mock) {
  return Test.createTestingModule({
    providers: [
      HealthyCheckService,
      {
        provide: WINSTON_MODULE_PROVIDER,
        useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      },
      { provide: PrismaService, useValue: { $queryRaw: queryRaw } },
    ],
  }).compile();
}

describe('HealthyCheckService', () => {
  it('reports ok when the database answers', async () => {
    const moduleRef = await build(jest.fn().mockResolvedValue([{ '1': 1 }]));
    const service = moduleRef.get(HealthyCheckService);

    await expect(service.healthyCheck()).resolves.toMatchObject({
      status: 'ok',
      database: 'up',
    });
  });

  it('throws 503 when the database is unreachable', async () => {
    const moduleRef = await build(
      jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    );
    const service = moduleRef.get(HealthyCheckService);

    // Previously this endpoint answered 200 regardless, so an orchestrator kept
    // routing traffic to an instance whose every query was failing.
    await expect(service.healthyCheck()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('reports which dependency failed', async () => {
    const moduleRef = await build(
      jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    );
    const service = moduleRef.get(HealthyCheckService);

    await service.healthyCheck().catch((error: ServiceUnavailableException) => {
      expect(error.getStatus()).toBe(503);
      expect(error.getResponse()).toMatchObject({
        errors: { database: 'down' },
      });
    });
  });
});
