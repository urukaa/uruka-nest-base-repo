import {
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
  BadRequestException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import r2Config from '../src/config/r2.config';
import { R2Service } from '../src/common/r2.service';

/**
 * No database and no network: these assertions are about the guard in front of
 * the upload, which runs before any S3 call is attempted.
 */
describe('R2Service upload limits', () => {
  const build = async (env: Record<string, string> = {}) => {
    const previous = { ...process.env };

    // Blanked deliberately. A developer's .env holds real R2 credentials, and
    // without this the "allowed mime" case would upload to the live bucket
    // instead of stopping at the config check.
    Object.assign(process.env, {
      R2_ACCESS_KEY_ID: '',
      R2_SECRET_ACCESS_KEY: '',
      R2_ENDPOINT: '',
      R2_BUCKET: '',
      R2_MEDIA_URL: '',
      ...env,
    });

    const moduleRef = await Test.createTestingModule({
      imports: [
        (await import('@nestjs/config')).ConfigModule.forFeature(r2Config),
      ],
      providers: [R2Service],
    }).compile();

    process.env = previous;
    return moduleRef.get(R2Service);
  };

  const file = (over: Partial<Express.Multer.File> = {}) =>
    ({
      buffer: Buffer.alloc(1024),
      mimetype: 'image/png',
      originalname: 'photo.png',
      ...over,
    }) as Express.Multer.File;

  it('rejects an empty file', async () => {
    const service = await build();

    await expect(
      service.uploadFile(file({ buffer: Buffer.alloc(0) })),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a file over the size limit', async () => {
    const service = await build({ UPLOAD_MAX_SIZE_MB: '1' });

    await expect(
      service.uploadFile(file({ buffer: Buffer.alloc(2 * 1024 * 1024) })),
    ).rejects.toThrow(PayloadTooLargeException);
  });

  it('rejects a disallowed mime type', async () => {
    const service = await build();

    await expect(
      service.uploadFile(file({ mimetype: 'application/x-msdownload' })),
    ).rejects.toThrow(UnsupportedMediaTypeException);
  });

  it('honours a widened allowlist', async () => {
    const service = await build({
      UPLOAD_ALLOWED_MIME: 'application/pdf,image/png',
    });

    // Passes the guard, then fails on missing R2 credentials — which is proof
    // the guard let it through rather than the upload succeeding by accident.
    await expect(
      service.uploadFile(file({ mimetype: 'application/pdf' })),
    ).rejects.toThrow(/R2 is not configured/);
  });

  it('checks the guard before touching storage config', async () => {
    const service = await build();

    // An oversized file must not reach the "R2 is not configured" path.
    await expect(
      service.uploadFile(file({ buffer: Buffer.alloc(10 * 1024 * 1024) })),
    ).rejects.toThrow(PayloadTooLargeException);
  });
});
