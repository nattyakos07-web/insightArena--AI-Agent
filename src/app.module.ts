import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AgentModule } from './agent/agent.module';
import { AssistantModule } from './assistant/assistant.module';
import { StellarModule } from './stellar/stellar.module';
import { CoachModule } from './coach/coach.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    AgentModule,
    AssistantModule,
    StellarModule,
    CoachModule,
  ],
})
export class AppModule {}
