import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { ConfigType } from '@nestjs/config';
import r2Config from 'src/config/r2.config';
import { v4 as uuidv4 } from 'uuid';

type R2Config = ConfigType<typeof r2Config>;
type ResolvedR2Config = { [K in keyof R2Config]: string };

@Injectable()
export class R2Service {
  private client?: S3Client;

  constructor(
    @Inject(r2Config.KEY)
    private readonly config: R2Config,
  ) {}

  /**
   * Config is validated on first use rather than in the constructor, so a
   * project that never touches object storage still boots without R2_* set.
   */
  private resolveConfig(): ResolvedR2Config {
    const missing = (
      ['accessKeyId', 'secretAccessKey', 'endpoint', 'bucket', 'url'] as const
    ).filter((key) => !this.config[key]);

    if (missing.length) {
      throw new Error(
        `R2 is not configured. Missing: ${missing.join(', ')}. ` +
          `Set the matching R2_* variables in .env.`,
      );
    }

    return this.config as ResolvedR2Config;
  }

  private get s3(): S3Client {
    if (!this.client) {
      const { endpoint, accessKeyId, secretAccessKey } = this.resolveConfig();

      this.client = new S3Client({
        region: 'auto',
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
      });
    }

    return this.client;
  }

  /**
   * Strips directory separators and anything outside a conservative charset, so
   * a crafted filename cannot inject key prefixes or unaddressable characters.
   */
  private static sanitizeFilename(originalname: string): string {
    const base = originalname.replace(/\\/g, '/').split('/').pop() ?? '';

    const cleaned = base
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^[.-]+/, '')
      .slice(0, 100);

    return cleaned || 'file';
  }

  async uploadFile(file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Empty file upload.');
    }

    const { bucket, url } = this.resolveConfig();
    const key = `${uuidv4()}-${Date.now()}-${R2Service.sanitizeFilename(file.originalname)}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    return {
      url: `${url.replace(/\/+$/, '')}/${key}`,
      key,
    };
  }

  async deleteFile(fileUrl: string): Promise<void> {
    const { bucket } = this.resolveConfig();
    const key = this.extractKeyFromUrl(fileUrl);

    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
  }

  private extractKeyFromUrl(fileUrl: string): string {
    const base = new URL(this.resolveConfig().url);

    let target: URL;
    try {
      target = new URL(fileUrl);
    } catch {
      throw new BadRequestException('Invalid file URL.');
    }

    // Without this check any caller-supplied URL would resolve to a key in our
    // bucket, turning deleteFile into arbitrary object deletion.
    if (target.origin !== base.origin) {
      throw new BadRequestException('File URL does not belong to this bucket.');
    }

    const basePath = base.pathname.replace(/\/+$/, '');

    if (basePath && !target.pathname.startsWith(`${basePath}/`)) {
      throw new BadRequestException('File URL does not belong to this bucket.');
    }

    const key = decodeURIComponent(target.pathname.slice(basePath.length + 1));

    if (!key || key.includes('..')) {
      throw new BadRequestException('Invalid file URL.');
    }

    return key;
  }
}
