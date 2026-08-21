import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  TrendSignal,
  UserPerformance,
  NearMilestoneData,
} from './interfaces/trend.interface';

// ---------------------------------------------------------------------------
// Threshold documentation
// ---------------------------------------------------------------------------
//
// All thresholds are configurable via environment variables with the defaults
// described below:
//
//   Threshold                  | Default | Env variable
//   ---------------------------|---------|------------------------------------
//   hotStreakMinLength         |   4     | TREND_HOT_STREAK_MIN_LENGTH
//   coldStreakMinLength        |   4     | TREND_COLD_STREAK_MIN_LENGTH
//   improvingDelta             |  15     | TREND_IMPROVING_DELTA
//   decliningDelta             |  15     | TREND_DECLINING_DELTA
//   nearMilestoneWindow        |   2     | TREND_NEAR_MILESTONE_WINDOW
//   recentWindowSize           |  10     | TREND_RECENT_WINDOW_SIZE
//
// ---------------------------------------------------------------------------

/** Round-number prediction totals that qualify as milestones. */
const TOTAL_PREDICTION_MILESTONES = [10, 25, 50, 100, 250, 500, 1000];

@Injectable()
export class TrendService {
  private readonly logger = new Logger(TrendService.name);

  /** Minimum consecutive-correct count to emit a `hot-streak` signal. */
  private readonly hotStreakMinLength: number;
  /** Minimum consecutive-wrong count to emit a `cold-streak` signal. */
  private readonly coldStreakMinLength: number;
  /**
   * Points above overall accuracy that the recent window must reach for an
   * `improving` signal to be emitted.
   */
  private readonly improvingDelta: number;
  /**
   * Points below overall accuracy that the recent window must drop for a
   * `declining` signal to be emitted.
   */
  private readonly decliningDelta: number;
  /** How many predictions away from a milestone to emit a `near-milestone` signal. */
  private readonly nearMilestoneWindow: number;
  /** Number of recent predictions to use for recency accuracy calculations. */
  private readonly recentWindowSize: number;

  constructor(private readonly configService: ConfigService) {
    this.hotStreakMinLength = this.resolveInt('TREND_HOT_STREAK_MIN_LENGTH', 4);
    this.coldStreakMinLength = this.resolveInt('TREND_COLD_STREAK_MIN_LENGTH', 4);
    this.improvingDelta = this.resolveInt('TREND_IMPROVING_DELTA', 15);
    this.decliningDelta = this.resolveInt('TREND_DECLINING_DELTA', 15);
    this.nearMilestoneWindow = this.resolveInt('TREND_NEAR_MILESTONE_WINDOW', 2);
    this.recentWindowSize = this.resolveInt('TREND_RECENT_WINDOW_SIZE', 10);

    this.logger.log(
      `TrendService initialised — hot:${this.hotStreakMinLength}, cold:${this.coldStreakMinLength}, ` +
        `improvingDelta:${this.improvingDelta}, decliningDelta:${this.decliningDelta}, ` +
        `nearMilestoneWindow:${this.nearMilestoneWindow}, recentWindowSize:${this.recentWindowSize}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Analyse a user's prediction history and return all active performance
   * signals, sorted by priority (lowest number = highest priority).
   *
   * The function is **pure and deterministic**: given the same
   * `UserPerformance`, it always returns the same result.
   *
   * @param performance - Snapshot of the user's prediction history.
   * @returns An array of `TrendSignal` objects, priority-ordered.  May be
   *   empty if no signals are active.
   */
  detectSignals(performance: UserPerformance): TrendSignal[] {
    const { history, personalBestStreak } = performance;

    if (!history || history.length === 0) {
      return [];
    }

    const signals: TrendSignal[] = [];

    // Collect each category of signal
    const hotStreak = this.detectHotStreak(history);
    if (hotStreak) signals.push(hotStreak);

    const coldStreak = this.detectColdStreak(history);
    if (coldStreak) signals.push(coldStreak);

    const improving = this.detectImproving(history);
    if (improving) signals.push(improving);

    const declining = this.detectDeclining(history);
    if (declining) signals.push(declining);

    const nearMilestones = this.detectNearMilestones(history, personalBestStreak);
    signals.push(...nearMilestones);

    // Sort by priority (ascending: 1 first)
    return signals.sort((a, b) => a.priority - b.priority);
  }

  // ---------------------------------------------------------------------------
  // Private signal detectors
  // ---------------------------------------------------------------------------

  /**
   * Detects a hot streak: ≥ `hotStreakMinLength` consecutive correct picks at
   * the tail of the history.
   */
  private detectHotStreak(history: boolean[]): TrendSignal | null {
    const streakLength = this.trailingStreakLength(history, true);
    if (streakLength >= this.hotStreakMinLength) {
      return { type: 'hot-streak', priority: 1, data: { streakLength } };
    }
    return null;
  }

  /**
   * Detects a cold streak: ≥ `coldStreakMinLength` consecutive wrong picks at
   * the tail of the history.
   */
  private detectColdStreak(history: boolean[]): TrendSignal | null {
    const streakLength = this.trailingStreakLength(history, false);
    if (streakLength >= this.coldStreakMinLength) {
      return { type: 'cold-streak', priority: 2, data: { streakLength } };
    }
    return null;
  }

  /**
   * Detects improvement: recent-window accuracy is ≥ `improvingDelta` points
   * above the overall accuracy.  Requires at least `recentWindowSize`
   * predictions in total so that the comparison is meaningful.
   */
  private detectImproving(history: boolean[]): TrendSignal | null {
    if (history.length < this.recentWindowSize) return null;

    const overallAccuracy = this.accuracy(history);
    const recentAccuracy = this.accuracy(history.slice(-this.recentWindowSize));
    const delta = recentAccuracy - overallAccuracy;

    if (delta >= this.improvingDelta) {
      return {
        type: 'improving',
        priority: 3,
        data: { recentAccuracy, overallAccuracy, delta },
      };
    }
    return null;
  }

  /**
   * Detects decline: overall accuracy is ≥ `decliningDelta` points above the
   * recent-window accuracy.  Requires at least `recentWindowSize` predictions.
   */
  private detectDeclining(history: boolean[]): TrendSignal | null {
    if (history.length < this.recentWindowSize) return null;

    const overallAccuracy = this.accuracy(history);
    const recentAccuracy = this.accuracy(history.slice(-this.recentWindowSize));
    const delta = overallAccuracy - recentAccuracy;

    if (delta >= this.decliningDelta) {
      return {
        type: 'declining',
        priority: 4,
        data: { recentAccuracy, overallAccuracy, delta },
      };
    }
    return null;
  }

  /**
   * Detects near-milestone conditions.  May return multiple signals if the
   * user is simultaneously close to both a round-number total and a personal-
   * best streak.
   */
  private detectNearMilestones(
    history: boolean[],
    personalBestStreak: number,
  ): TrendSignal[] {
    const signals: TrendSignal[] = [];

    // --- 1. Total predictions milestone ---
    const totalPredictions = history.length;
    const totalMilestone = this.nearestUpcomingMilestone(
      totalPredictions,
      TOTAL_PREDICTION_MILESTONES,
    );
    if (totalMilestone !== null) {
      const predictionsAway = totalMilestone - totalPredictions;
      const data: NearMilestoneData = {
        milestoneType: 'total-predictions',
        milestoneValue: totalMilestone,
        predictionsAway,
        currentTotal: totalPredictions,
      };
      signals.push({ type: 'near-milestone', priority: 5, data });
    }

    // --- 2. Personal-best streak milestone ---
    const currentStreak = this.trailingStreakLength(history, true);
    if (personalBestStreak > 0 && currentStreak > 0) {
      const streakMilestone = personalBestStreak + 1; // beat the PB by at least 1
      const predictionsAway = streakMilestone - currentStreak;
      if (predictionsAway > 0 && predictionsAway <= this.nearMilestoneWindow) {
        const data: NearMilestoneData = {
          milestoneType: 'personal-best-streak',
          milestoneValue: streakMilestone,
          predictionsAway,
          currentStreak,
        };
        signals.push({ type: 'near-milestone', priority: 5, data });
      }
    }

    return signals;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns the length of the consecutive trailing run of `value` at the end
   * of `history`.  Returns 0 if the last element differs from `value`.
   */
  private trailingStreakLength(history: boolean[], value: boolean): number {
    let length = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i] === value) {
        length++;
      } else {
        break;
      }
    }
    return length;
  }

  /**
   * Returns accuracy as a 0–100 percentage (rounded to 2 decimal places) for
   * the provided array.  Returns 0 for empty arrays.
   */
  private accuracy(outcomes: boolean[]): number {
    if (outcomes.length === 0) return 0;
    const correct = outcomes.filter(Boolean).length;
    return Math.round((correct / outcomes.length) * 10000) / 100;
  }

  /**
   * Finds the nearest upcoming milestone from `milestones` that is within
   * `nearMilestoneWindow` of `current`.  Returns `null` if none qualifies.
   *
   * Only milestones strictly above `current` are considered.
   */
  private nearestUpcomingMilestone(
    current: number,
    milestones: number[],
  ): number | null {
    const sorted = [...milestones].sort((a, b) => a - b);
    for (const milestone of sorted) {
      if (milestone > current) {
        const distance = milestone - current;
        if (distance <= this.nearMilestoneWindow) {
          return milestone;
        }
        // Milestones are sorted ascending; no closer milestone exists after this
        break;
      }
    }
    return null;
  }

  /** Parse an integer from config with a fallback default. */
  private resolveInt(key: string, defaultValue: number): number {
    const raw = this.configService.get<string>(key);
    if (raw === undefined || raw === null || raw === '') return defaultValue;
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }
}
