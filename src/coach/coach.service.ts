import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../assistant/llm/llm.service';
import { TrendService } from './trend.service';
import { UserPerformance, TrendSignal } from './interfaces/trend.interface';
import { CoachingInsight, LlmInsightResponse } from './interfaces/coaching-insight.interface';
import { buildCoachingInsightPrompt } from './prompts/coaching-insight.prompt';
import { MAX_INSIGHT_MESSAGE_LENGTH, containsInsightBlockedPhrase } from './coach.constants';

// ---------------------------------------------------------------------------
// Deterministic fallback messages (used when LLM fails or all insights reject)
// ---------------------------------------------------------------------------

function buildFallbackInsights(
  performance: UserPerformance,
  signals: TrendSignal[],
): CoachingInsight[] {
  return signals.slice(0, 3).map((signal): CoachingInsight => {
    switch (signal.type) {
      case 'hot-streak':
        return {
          message: `You're on a ${signal.data.streakLength}-prediction winning streak! Your recent form is excellent — keep trusting your analysis.`,
          signalType: 'hot-streak',
          priority: 3,
        };
      case 'cold-streak':
        return {
          message: `You've had ${signal.data.streakLength} tough picks in a row. Take time to review the data before your next pick — every expert has rough patches.`,
          signalType: 'cold-streak',
          priority: 2,
        };
      case 'improving':
        return {
          message: `Your recent accuracy is ${signal.data.recentAccuracy}% — ${signal.data.delta} points above your overall average of ${signal.data.overallAccuracy}%. You're getting sharper!`,
          signalType: 'improving',
          priority: 2,
        };
      case 'declining':
        return {
          message: `Your recent accuracy is ${signal.data.recentAccuracy}% vs your overall ${signal.data.overallAccuracy}%. A quick review of recent picks could help you refocus.`,
          signalType: 'declining',
          priority: 2,
        };
      case 'near-milestone': {
        if (signal.data.milestoneType === 'personal-best-streak') {
          return {
            message: `You're ${signal.data.predictionsAway} correct pick(s) away from beating your personal best streak of ${signal.data.milestoneValue}! Stay focused.`,
            signalType: 'near-milestone',
            priority: 3,
          };
        }
        return {
          message: `You're ${signal.data.predictionsAway} prediction(s) away from reaching ${signal.data.milestoneValue} total picks. Keep it up!`,
          signalType: 'near-milestone',
          priority: 1,
        };
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_SIGNAL_TYPES = new Set([
  'hot-streak',
  'cold-streak',
  'improving',
  'declining',
  'near-milestone',
]);
const VALID_PRIORITIES = new Set([1, 2, 3]);

function isValidInsightShape(raw: unknown): raw is CoachingInsight {
  if (!raw || typeof raw !== 'object') return false;
  const obj = raw as Record<string, unknown>;
  return (
    typeof obj['message'] === 'string' &&
    typeof obj['signalType'] === 'string' &&
    VALID_SIGNAL_TYPES.has(obj['signalType'] as string) &&
    typeof obj['priority'] === 'number' &&
    VALID_PRIORITIES.has(obj['priority'] as number)
  );
}

function enforceInsightRules(insight: CoachingInsight): CoachingInsight | null {
  if (insight.message.length > MAX_INSIGHT_MESSAGE_LENGTH) return null;
  if (containsInsightBlockedPhrase(insight.message)) return null;
  return insight;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class CoachService {
  private readonly logger = new Logger(CoachService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly trendService: TrendService,
  ) {}

  async generateInsights(performance: UserPerformance): Promise<CoachingInsight[]> {
    const signals = this.trendService.detectSignals(performance);

    if (signals.length === 0) {
      return [
        {
          message: `You've made ${performance.history.length} prediction(s) so far. Keep going — patterns emerge with more data!`,
          signalType: 'improving',
          priority: 1,
        },
      ];
    }

    try {
      const insights = await this.generateWithLlm(performance, signals);
      if (insights.length > 0) return insights;
      this.logger.warn('All LLM insights failed post-generation validation; using fallback.');
    } catch (err) {
      this.logger.warn(
        `LLM insight generation failed (${(err as Error).message}); using fallback.`,
      );
    }

    return buildFallbackInsights(performance, signals);
  }

  private async generateWithLlm(
    performance: UserPerformance,
    signals: TrendSignal[],
  ): Promise<CoachingInsight[]> {
    const prompt = buildCoachingInsightPrompt(performance, signals);
    const raw = await this.llm.complete({
      system: prompt.system,
      user: prompt.user,
      json: true,
      temperature: 0.5,
    });

    const parsed = this.parseAndValidateLlmResponse(raw);
    if (!parsed) {
      throw new Error('LLM response did not match the expected CoachingInsight JSON schema');
    }

    return parsed.insights
      .slice(0, 3)
      .map(enforceInsightRules)
      .filter((i): i is CoachingInsight => i !== null);
  }

  private parseAndValidateLlmResponse(raw: string): LlmInsightResponse | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.logger.warn('LLM response was not valid JSON');
      return null;
    }
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Record<string, unknown>;
    if (!Array.isArray(obj['insights'])) return null;
    const insights = (obj['insights'] as unknown[]).filter(isValidInsightShape);
    if (insights.length === 0) return null;
    return { insights };
  }
}
