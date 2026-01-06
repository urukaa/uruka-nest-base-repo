import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { requireEnv } from 'src/common/env';

@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  private readonly allowedIps = [
    '127.0.0.1', // Localhost
    '::1', // IPv6 localhost
    '103.125.181.204',
    '172.28.0.1',
    '172.29.0.1',
  ];
  private readonly lifespanMinutes = 5; // lifespan 5 menit
  //   private badIps = new Set<string>();

  use(req: Request, res: Response, next: NextFunction) {
    if (requireEnv('IS_VO1D_TESTING') === `nggih`) {
      return next(); // bypass
    }

    const openPaths = [
      '/api/health',
      // '/api/auth/google/callback',
      // '/api/midtrans/notification',
    ];

    const requestPath = req.originalUrl.split('?')[0]; // buang query param

    if (openPaths.includes(requestPath)) {
      return next(); // bypass
    }

    if (req.method === 'OPTIONS') {
      return next(); // biarkan preflight jalan dulu
    }

    // const origin = req.headers['origin'];
    const appKey = req.headers['x-app-key'] as string;
    const timestamp = req.headers['x-timestamp'] as string;
    const signature = req.headers['x-signature'] as string;
    const userAgent = req.headers['user-agent'];

    const serverAppKey = requireEnv('APP_KEY');
    const serverSecretKey = requireEnv('APP_SECRET');
    const appName = requireEnv('APP_NAME');

    if (!serverSecretKey || !appName) {
      throw new ForbiddenException('API cant Running.');
    }

    // if (!origin) {
    //   throw new ForbiddenException('Access denied. No Origin header.');
    // }

    if (!appKey || appKey !== serverAppKey) {
      throw new ForbiddenException('Unauthorized. Invalid app key.');
    }

    // --- Cek IP Address ---
    const requestIp = req.ip || req.socket.remoteAddress;

    // Kadang IP ada format ::ffff:127.0.0.1 jadi kita beresin
    const cleanedIp = requestIp?.replace('::ffff:', '');

    if (!cleanedIp || !this.allowedIps.includes(cleanedIp)) {
      throw new ForbiddenException(`Access denied for IP: ${cleanedIp}`);
    }

    // if (this.badIps.has(cleanedIp)) {
    //   throw new ForbiddenException('This IP has been blocked.');
    // }

    //  Cek Timestamp (Lifespan)
    if (!timestamp) throw new ForbiddenException('Missing timestamp.');

    const requestTime = new Date(timestamp).getTime();
    const now = Date.now();
    const lifespanMs = this.lifespanMinutes * 60 * 1000; // menit ke ms

    if (Math.abs(now - requestTime) > lifespanMs) {
      throw new ForbiddenException('Request expired.');
    }

    //  Cek Signature
    if (!signature) throw new ForbiddenException('Missing signature.');

    const rawString = `${timestamp}:${appName}`;

    const hmac = crypto.createHmac('sha256', serverSecretKey);
    hmac.update(rawString);
    const expectedSignature = hmac.digest('hex');

    if (signature !== expectedSignature) {
      throw new ForbiddenException('Invalid signature.');
    }

    // Gunakan timingSafeEqual biar aman dari timing attack
    const isValid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signature),
    );

    if (!isValid) {
      // ban if tempering
      // this.badIps.add(cleanedIp);
      throw new ForbiddenException('Invalid signature.');
    }

    // --- Cek User-Agent ---
    if (!userAgent || userAgent.trim() === '') {
      throw new ForbiddenException('Access denied. No User-Agent.');
    }

    // (optional) whitelist User-Agent tertentu
    const isProduction = requireEnv('IS_VO1D_PRODUCTION') === 'nggih';

    const allowedUserAgents = isProduction
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
