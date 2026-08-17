import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthModule } from '../src/auth/auth.module';
import { AuthService } from '../src/auth/auth.service';
import { CommonModule } from '../src/common/common.module';

/**
 * Compiles AuthModule without AppModule and without touching a database.
 *
 * CommonModule comes along because AuthService genuinely needs Prisma, the
 * logger and the validator — but nothing here issues a query, so this stays
 * fast and runs everywhere. What it guards is the wiring: jwtConfig resolving,
 * and the expiry actually being usable.
 */
describe('AuthModule', () => {
  const build = () =>
    Test.createTestingModule({ imports: [CommonModule, AuthModule] }).compile();

  it('compiles without AppModule', async () => {
    const moduleRef = await build();

    expect(moduleRef.get(JwtService)).toBeDefined();
    expect(moduleRef.get(AuthService)).toBeDefined();
  });

  it('signs tokens with a finite expiry', async () => {
    const moduleRef = await build();
    const jwt = moduleRef.get(JwtService);

    const token = jwt.sign({ sub: 1, username: 'gento', role: 'USER' });
    const decoded = jwt.verify<{ sub: number; iat: number; exp: number }>(
      token,
    );

    expect(decoded.sub).toBe(1);
    // Regression guard: reading the expiry from the wrong config path yielded
    // NaN, and jsonwebtoken rejects that outright — sign() threw, so every
    // login would have been a 500.
    expect(Number.isFinite(decoded.exp)).toBe(true);
    expect(decoded.exp).toBeGreaterThan(decoded.iat);
  });

  it('hashes refresh tokens rather than storing them', () => {
    const hash = AuthService.hashRefreshToken('a-refresh-token');

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain('a-refresh-token');
  });
});
