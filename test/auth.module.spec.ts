import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthModule } from '../src/auth/auth.module';

/**
 * AuthModule is deliberately not imported by AppModule — a feature module
 * (typically UserModule) wires it in. That leaves it unexercised at runtime,
 * so its configuration is verified here instead.
 */
describe('AuthModule', () => {
  it('compiles standalone', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
    }).compile();

    expect(moduleRef.get(JwtService)).toBeDefined();
  });

  it('signs tokens with a finite expiry', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
    }).compile();

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
});
