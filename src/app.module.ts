import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { healthyCheckModule } from './healty_check/healthycheck.module';

@Module({
  imports: [CommonModule,
    healthyCheckModule
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
