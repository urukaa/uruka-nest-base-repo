import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { envList, isProduction, isTesting, requireEnv } from 'src/common/env';

/** Compares two strings without leaking match position through timing. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');

  // timingSafeEqual throws on length mismatch, so short-circuit first. Both
  // operands here are fixed-length hex digests, so length reveals nothing.
  if (left.length !== right.length) return false;

  return crypto.timingSafeEqual(left, right);
}

@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  private readonly allowedIps = envList('ALLOWED_IPS', [
    '127.0.0.1', // Localhost
    '::1', // IPv6 localhost
  ]);
  private readonly lifespanMinutes = 5; // lifespan 5 menit

  private readonly openPaths = [
    '/api/health',
    // '/api/auth/google/callback',
    // '/api/midtrans/notification',
  ];

  // Read once at construction (which Nest does during app.init) rather than
  // per request: an invalid IS_VO1D_TESTING then fails at boot instead of
  // turning every request into a 500.
  private readonly bypass = isTesting();

  // Only required when enforcement is actually on, so a local clone running
  // with IS_VO1D_TESTING=nggih never needs signing credentials at all.
  private readonly appKey = this.bypass ? '' : requireEnv('APP_KEY');
  private readonly secretKey = this.bypass ? '' : requireEnv('APP_SECRET');
  private readonly appName = this.bypass ? '' : requireEnv('APP_NAME');

  use(req: Request, res: Response, next: NextFunction) {
    if (this.bypass) {
      return next(); // bypass
    }

    const requestPath = req.originalUrl.split('?')[0]; // buang query param

    if (this.openPaths.includes(requestPath)) {
      return next(); // bypass
    }

    if (req.method === 'OPTIONS') {
      return next(); // biarkan preflight jalan dulu
    }

    const appKey = req.headers['x-app-key'] as string;
    const timestamp = req.headers['x-timestamp'] as string;
    const signature = req.headers['x-signature'] as string;
    const userAgent = req.headers['user-agent'];

    if (!appKey || !safeEqual(appKey, this.appKey)) {
      throw new ForbiddenException('Unauthorized. Invalid app key.');
    }

    // --- Cek IP Address ---
    const requestIp = req.ip || req.socket.remoteAddress;

    // Kadang IP ada format ::ffff:127.0.0.1 jadi kita beresin
    const cleanedIp = requestIp?.replace('::ffff:', '');

    if (!cleanedIp || !this.allowedIps.includes(cleanedIp)) {
      throw new ForbiddenException(`Access denied for IP: ${cleanedIp}`);
    }

    //  Cek Timestamp (Lifespan)
    if (!timestamp) throw new ForbiddenException('Missing timestamp.');

    const requestTime = new Date(timestamp).getTime();

    if (Number.isNaN(requestTime)) {
      throw new ForbiddenException('Invalid timestamp.');
    }

    const now = Date.now();
    const lifespanMs = this.lifespanMinutes * 60 * 1000; // menit ke ms

    if (Math.abs(now - requestTime) > lifespanMs) {
      throw new ForbiddenException('Request expired.');
    }

    //  Cek Signature
    if (!signature) throw new ForbiddenException('Missing signature.');

    const rawString = `${timestamp}:${this.appName}`;

    const expectedSignature = crypto
      .createHmac('sha256', this.secretKey)
      .update(rawString)
      .digest('hex');

    if (!safeEqual(signature, expectedSignature)) {
      throw new ForbiddenException('Invalid signature.');
    }

    // --- Cek User-Agent ---
    if (!userAgent || userAgent.trim() === '') {
      throw new ForbiddenException('Access denied. No User-Agent.');
    }

    // (optional) whitelist User-Agent tertentu
    const allowedUserAgents = isProduction()
      ? ['Vo1dApp'] // hanya Vo1dApp di production
      : ['Vo1dApp', 'Mozilla', 'Chrome', 'Safari', 'PostmanRuntime']; // longgar di dev

    const isAllowed = allowedUserAgents.some((allowed) =>
      userAgent.includes(allowed),
    );

    if (!isAllowed) {
      throw new ForbiddenException(`Access denied. Invalid User-Agent.`);
    }

    next();
  }
}
