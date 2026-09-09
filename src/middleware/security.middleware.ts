import {
  ForbiddenException,
  Injectable,
  NestMiddleware,
  RawBodyRequest,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import {
  envList,
  envNumber,
  isProduction,
  isTesting,
  optionalEnv,
  requireEnv,
} from 'src/common/env';

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
  // Signature Window. Default 60 seconds (1 minute)
  private readonly signatureWindowMs =
    envNumber('SIGNATURE_WINDOW_SECONDS', 60) * 1000;

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
  private readonly appName = this.bypass ? '' : requireEnv('APP_NAME');

  private readonly appKeys = this.acceptedValues('APP_KEY');
  private readonly secretKeys = this.acceptedValues('APP_SECRET');

  private acceptedValues(name: string): string[] {
    if (this.bypass) return [];

    return [requireEnv(name), optionalEnv(`${name}_PREVIOUS`, '')].filter(
      Boolean,
    );
  }

  private matchesAny(candidate: string, accepted: string[]): boolean {
    return accepted.reduce(
      (matched, value) => safeEqual(candidate, value) || matched,
      false,
    );
  }

  private signatureMatches(signature: string, rawString: string): boolean {
    return this.secretKeys.reduce((matched, secret) => {
      const expected = crypto
        .createHmac('sha256', secret)
        .update(rawString)
        .digest('hex');

      return safeEqual(signature, expected) || matched;
    }, false);
  }

  use(req: RawBodyRequest<Request>, res: Response, next: NextFunction) {
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

    if (!appKey || !this.matchesAny(appKey, this.appKeys)) {
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

    if (Math.abs(now - requestTime) > this.signatureWindowMs) {
      throw new ForbiddenException('Request expired.');
    }

    //  Cek Signature
    if (!signature) throw new ForbiddenException('Missing signature.');

    // Bound to this exact request. Covering only timestamp + appName would let
    // a signature captured from any endpoint be replayed against every other
    // one for the length of the window.
    const bodyHash = crypto
      .createHash('sha256')
      .update(req.rawBody ?? Buffer.alloc(0))
      .digest('hex');

    const rawString = [
      req.method.toUpperCase(),
      requestPath,
      timestamp,
      this.appName,
      bodyHash,
    ].join('\n');

    if (!this.signatureMatches(signature, rawString)) {
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
