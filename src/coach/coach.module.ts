import { Module } from '@nestjs/common';
import { TrendService } from './trend.service';
import { CoachService } from './coach.service';
import { LlmService } from '../assistant/llm/llm.service';

@Module({
  providers: [TrendService, CoachService, LlmService],
  exports: [TrendService, CoachService],
})
export class CoachModule {}
