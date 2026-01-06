import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { healthyCheckModule } from './healty_check/healthycheck.module';
import { ConfigModule } from '@nestjs/config';
import jwtConfig from './auth/config/jwt.config';
import r2Config from './config/r2.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // supaya config bisa diakses dari mana saja
      load: [jwtConfig, r2Config], // Semua config dimuat di sini
    }),

    CommonModule,
    healthyCheckModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
