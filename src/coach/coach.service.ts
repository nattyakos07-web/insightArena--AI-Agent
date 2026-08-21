import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../assistant/llm/llm.service';
import { TrendService } from './trend.service';
import { UserPerformance, TrendSignal } from './interfaces/trend.interface';
import { CoachingInsight, LlmInsightResponse } from './interfaces/coaching-insight.interface';
import { buildCoachingInsightPrompt } from './prompts/coaching-insight.prompt';
import {
  MAX_INSIGHT_MESSAGE_LENGTH,
  containsInsightBlockedPhrase,
} from './coach.constants';

// ---------------------------------------------------------------------------
// Fallback template messages
// ---------------------------------------------------------------------------
// Used when the LLM call fails, returns invalid JSON, or every generated
// insight violates a hard rule.  Each fallback references the signal data
// to stay concrete; they are intentionally deterministic and never use
// gambling-adjacent language.

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
          message: `You've had a tough run recently (${signal.data.streakLength} in a row). Take time to review the data before your next pick — every expert has rough patches.`,
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

const VALID_SIGNAL_TYPES = new Set<string>([
  'hot-streak',
  'cold-streak',
  'improving',
  'declining',
  'near-milestone',
]);

const VALID_PRIORITIES = new Set<number>([1, 2, 3]);

/**
 * Validates a single raw insight object from the LLM response.
 * Returns true only if it has the correct shape and data types.
 */
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

/**
 * Enforces the hard post-generation rules on a coaching insight:
 *   1. Message length ≤ 280 characters
 *   2. No gambling-encouragement phrases
 *
 * Returns the insight if it passes, or `null` if it fails any rule.
 */
function enforceInsightRules(insight: CoachingInsight): CoachingInsight | null {
  if (insight.message.length > MAX_INSIGHT_MESSAGE_LENGTH) return null;
  if (containsInsightBlockedPhrase(insight.message)) return null;
  return insight;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * CoachService generates personalized coaching insights for a user based on
 * their prediction history and detected trend signals.
 *
 * Pipeline:
 *   1. Fetch UserPerformance by userId (caller provides it for testability)
 *   2. Run TrendService.detectSignals() to get TrendSignal[]
 *   3. Build the coaching-insight prompt
 *   4. Call LlmService.complete() with JSON mode
 *   5. Parse, validate structure, and enforce hard rules (length + blocklist)
 *   6. Fall back to deterministic template messages if LLM fails or all
 *      insights are rejected
 *
 * The user always receives insights — never an error.
 */
@Injectable()
export class CoachService {
  private readonly logger = new Logger(CoachService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly trendService: TrendService,
  ) {}

  /**
   * Main entry point.  Given a `UserPerformance` snapshot, returns 1–3
   * validated `CoachingInsight` objects.
   *
   * @param performance - The user's prediction history and personal best streak.
   * @returns Array of 1–3 coaching insights, always populated (never throws).
   */
  async generateInsights(performance: UserPerformance): Promise<CoachingInsight[]> {
    const signals = this.trendService.detectSignals(performance);

    // No signals detected — return a generic encouragement fallback.
    if (signals.length === 0) {
      return [
        {
          message: `You've made ${performance.history.length} prediction(s) so far. Keep going — patterns emerge with more data!`,
          signalType: 'improving',
          priority: 1,
        },
      ];
    }

    // Attempt LLM-powered insight generation.
    try {
      const insights = await this.generateWithLlm(performance, signals);
      if (insights.length > 0) {
        return insights;
      }
      // LLM returned insights but all failed validation — fall through.
      this.logger.warn('All LLM insights failed post-generation validation; using fallback.');
    } catch (err) {
      this.logger.warn(
        `LLM insight generation failed (${(err as Error).message}); using fallback.`,
      );
    }

    return buildFallbackInsights(performance, signals);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Calls the LLM and returns validated insights.
   * Throws if the LLM call fails or the response is not valid JSON.
   * Returns an empty array if all insights fail post-generation rule enforcement.
   */
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
    if (parsed === null) {
      throw new Error('LLM response did not match the expected CoachingInsight JSON schema');
    }

    // Apply per-insight hard rules; keep only insights that pass.
    const validated = parsed.insights
      .slice(0, 3) // cap at 3
      .map(enforceInsightRules)
      .filter((i): i is CoachingInsight => i !== null);

    return validated;
  }

  /**
   * Parses the raw LLM string response into a `LlmInsightResponse`.
   * Returns `null` if parsing fails or the shape is invalid.
   */
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
