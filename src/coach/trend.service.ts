import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TrendSignal, UserPerformance, NearMilestoneData } from './interfaces/trend.interface';

const TOTAL_PREDICTION_MILESTONES = [10, 25, 50, 100, 250, 500, 1000];

@Injectable()
export class TrendService {
  private readonly logger = new Logger(TrendService.name);

  private readonly hotStreakMinLength: number;
  private readonly coldStreakMinLength: number;
  private readonly improvingDelta: number;
  private readonly decliningDelta: number;
  private readonly nearMilestoneWindow: number;
  private readonly recentWindowSize: number;

  constructor(private readonly config: ConfigService) {
    this.hotStreakMinLength = parseInt(config.get('TREND_HOT_STREAK_MIN_LENGTH') ?? '4', 10);
    this.coldStreakMinLength = parseInt(config.get('TREND_COLD_STREAK_MIN_LENGTH') ?? '4', 10);
    this.improvingDelta = parseInt(config.get('TREND_IMPROVING_DELTA') ?? '15', 10);
    this.decliningDelta = parseInt(config.get('TREND_DECLINING_DELTA') ?? '15', 10);
    this.nearMilestoneWindow = parseInt(config.get('TREND_NEAR_MILESTONE_WINDOW') ?? '2', 10);
    this.recentWindowSize = parseInt(config.get('TREND_RECENT_WINDOW_SIZE') ?? '10', 10);
  }

  detectSignals(performance: UserPerformance): TrendSignal[] {
    const { history, personalBestStreak } = performance;
    if (history.length === 0) return [];

    const signals: TrendSignal[] = [];

    // --- hot-streak ---
    const currentStreak = this.currentCorrectStreak(history);
    if (currentStreak >= this.hotStreakMinLength) {
      signals.push({ type: 'hot-streak', priority: 1, data: { streakLength: currentStreak } });
    }

    // --- cold-streak ---
    const coldStreak = this.currentWrongStreak(history);
    if (coldStreak >= this.coldStreakMinLength) {
      signals.push({ type: 'cold-streak', priority: 2, data: { streakLength: coldStreak } });
    }

    // --- improving / declining ---
    if (history.length > this.recentWindowSize) {
      const recentWindow = history.slice(-this.recentWindowSize);
      const recentAccuracy = Math.round(
        (recentWindow.filter(Boolean).length / recentWindow.length) * 100,
      );
      const overallAccuracy = Math.round(
        (history.filter(Boolean).length / history.length) * 100,
      );

      const delta = recentAccuracy - overallAccuracy;
      if (delta >= this.improvingDelta) {
        signals.push({
          type: 'improving',
          priority: 3,
          data: { recentAccuracy, overallAccuracy, delta },
        });
      } else if (-delta >= this.decliningDelta) {
        signals.push({
          type: 'declining',
          priority: 4,
          data: { recentAccuracy, overallAccuracy, delta: -delta },
        });
      }
    }

    // --- near-milestone (total predictions) ---
    const total = history.length;
    for (const milestone of TOTAL_PREDICTION_MILESTONES) {
      const away = milestone - total;
      if (away > 0 && away <= this.nearMilestoneWindow) {
        const data: NearMilestoneData = {
          milestoneType: 'total-predictions',
          milestoneValue: milestone,
          predictionsAway: away,
          currentTotal: total,
        };
        signals.push({ type: 'near-milestone', priority: 5, data });
        break;
      }
    }

    // --- near-milestone (personal best streak) ---
    if (personalBestStreak > 0) {
      const pbAway = personalBestStreak + 1 - currentStreak;
      if (pbAway > 0 && pbAway <= this.nearMilestoneWindow) {
        const data: NearMilestoneData = {
          milestoneType: 'personal-best-streak',
          milestoneValue: personalBestStreak + 1,
          predictionsAway: pbAway,
          currentStreak,
        };
        // Only push if we haven't already pushed a near-milestone for total predictions
        const alreadyHasNearMilestone = signals.some((s) => s.type === 'near-milestone');
        if (!alreadyHasNearMilestone) {
          signals.push({ type: 'near-milestone', priority: 5, data });
        }
      }
    }

    return signals.sort((a, b) => a.priority - b.priority);
  }

  private currentCorrectStreak(history: boolean[]): number {
    let streak = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i]) streak++;
      else break;
    }
    return streak;
  }

  private currentWrongStreak(history: boolean[]): number {
    let streak = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      if (!history[i]) streak++;
      else break;
    }
    return streak;
  }
}
