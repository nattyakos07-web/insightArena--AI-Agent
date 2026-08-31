import { Module } from '@nestjs/common';
import { TrendService } from './trend.service';
import { CoachService } from './coach.service';
import { CoachInsightsService } from './coach-insights.service';
import { CoachController } from './coach.controller';
import { LlmService } from '../assistant/llm/llm.service';

@Module({
  controllers: [CoachController],
  providers: [TrendService, CoachService, CoachInsightsService, LlmService],
  exports: [TrendService, CoachService, CoachInsightsService],
})
export class CoachModule {}
