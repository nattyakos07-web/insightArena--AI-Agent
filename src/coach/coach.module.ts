import { Module } from '@nestjs/common';
import { TrendService } from './trend.service';

@Module({
  providers: [TrendService],
  exports: [TrendService],
})
export class CoachModule {}
