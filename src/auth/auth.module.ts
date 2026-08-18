import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ExternalAuthService } from './external-auth.service';
import jwtConfig from './config/jwt.config';
import externalAuthConfig from './config/external-auth.config';

// forFeature keeps this module self-contained: it can be imported by a feature
// module (or a test) without relying on AppModule having loaded jwtConfig.
const JwtConfigModule = ConfigModule.forFeature(jwtConfig);

@Module({
  imports: [
    JwtConfigModule,
    ConfigModule.forFeature(externalAuthConfig),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [JwtConfigModule],
      inject: [jwtConfig.KEY],
      useFactory: (config: ConfigType<typeof jwtConfig>) => ({
        secret: config.secret,
        signOptions: config.signOptions,
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [JwtStrategy, AuthService, ExternalAuthService],
  exports: [JwtModule, PassportModule, AuthService, ExternalAuthService],
})
export class AuthModule {}
