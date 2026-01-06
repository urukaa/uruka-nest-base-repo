import { Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import r2Config from 'src/config/r2.config';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class R2Service {
  private s3: S3Client;
  private bucket: string;

  constructor(
    @Inject(r2Config.KEY)
    private config: ConfigType<typeof r2Config>,
  ) {
    const { accessKeyId, secretAccessKey, endpoint, bucket } = this.config;

    if (!accessKeyId || !secretAccessKey || !endpoint || !bucket) {
      throw new Error('Missing R2 configuration');
    }

    this.bucket = bucket;

    this.s3 = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async uploadFile(file: Express.Multer.File) {
    const key = `${uuidv4()}-${Date.now()}-${file.originalname}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    return {
      url: `${this.config.url}/${key}`,
      key,
    };
  }

  async deleteFile(fileUrl: string): Promise<void> {
    const key = this.extractKeyFromUrl(fileUrl); // contoh: "talent/uuid.jpg"
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  private extractKeyFromUrl(fileUrl: string): string {
    const url = new URL(fileUrl);
    return decodeURIComponent(url.pathname.substring(1)); // remove leading '/'
  }
}
