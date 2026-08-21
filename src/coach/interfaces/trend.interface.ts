/**
 * Domain types for the streak and trend detection feature.
 *
 * Intentionally plain interfaces (no ORM / class-validator decorators) so the
 * TrendService remains a pure, side-effect-free unit that is easy to test and
 * reason about.
 */

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * A single resolved prediction made by a user.
 * `true` means the user predicted correctly; `false` means they were wrong.
 * The array must be ordered chronologically (oldest first, newest last).
 */
export type PredictionOutcome = boolean;

/**
 * Full performance snapshot for a user, passed to `detectSignals`.
 *
 * - `history`            — ordered list of prediction outcomes (oldest → newest)
 * - `personalBestStreak` — the user's all-time longest correct-prediction streak
 */
export interface UserPerformance {
  /**
   * Chronological list of prediction outcomes.
   * `true`  = correct prediction
   * `false` = incorrect prediction
   *
   * Must have at least 1 element.  Callers should pass as many entries as are
   * available; the service only looks at the last 10 for the recency window.
   */
  history: PredictionOutcome[];

  /**
   * The user's all-time personal-best consecutive-correct-prediction streak.
   * Used by the `near-milestone` signal to detect when a user is close to
   * beating their personal best.
   *
   * Must be ≥ 0.  A value of 0 means no streak record exists yet.
   */
  personalBestStreak: number;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** All possible signal type identifiers. */
export type SignalType = 'hot-streak' | 'cold-streak' | 'improving' | 'declining' | 'near-milestone';

/**
 * Priority ordering used when multiple signals are returned together.
 * Lower number → higher priority (returned first in the array).
 *
 *   hot-streak     → 1
 *   cold-streak    → 2
 *   improving      → 3
 *   declining      → 4
 *   near-milestone → 5
 */
export type SignalPriority = 1 | 2 | 3 | 4 | 5;

// ---------------------------------------------------------------------------
// Per-signal data payloads
// ---------------------------------------------------------------------------

/** Carried by `hot-streak` signals. */
export interface HotStreakData {
  /** Current consecutive-correct streak length. */
  streakLength: number;
}

/** Carried by `cold-streak` signals. */
export interface ColdStreakData {
  /** Current consecutive-wrong streak length. */
  streakLength: number;
}

/** Carried by `improving` signals. */
export interface ImprovingData {
  /**
   * Accuracy in the most recent 10 predictions (0–100 percentage points).
   * Will be at least `IMPROVING_DELTA` points above `overallAccuracy`.
   */
  recentAccuracy: number;
  /** Accuracy across the full history (0–100 percentage points). */
  overallAccuracy: number;
  /** `recentAccuracy - overallAccuracy` (always ≥ configured threshold). */
  delta: number;
}

/** Carried by `declining` signals. */
export interface DecliningData {
  /**
   * Accuracy in the most recent 10 predictions (0–100 percentage points).
   * Will be at least `DECLINING_DELTA` points below `overallAccuracy`.
   */
  recentAccuracy: number;
  /** Accuracy across the full history (0–100 percentage points). */
  overallAccuracy: number;
  /** `overallAccuracy - recentAccuracy` (always ≥ configured threshold, positive). */
  delta: number;
}

/** Carried by `near-milestone` signals. */
export interface NearMilestoneData {
  /**
   * The milestone the user is approaching.
   * Either a round-number total-prediction milestone or a personal-best streak milestone.
   */
  milestoneType: 'total-predictions' | 'personal-best-streak';
  /** The milestone value the user is close to reaching. */
  milestoneValue: number;
  /** How many predictions away from the milestone (1 or 2). */
  predictionsAway: number;
  /** Total predictions made so far (for total-predictions milestones). */
  currentTotal?: number;
  /** Current active streak length (for personal-best-streak milestones). */
  currentStreak?: number;
}

// ---------------------------------------------------------------------------
// Union signal type
// ---------------------------------------------------------------------------

/** A detected performance signal with structured payload and metadata. */
export type TrendSignal =
  | {
      type: 'hot-streak';
      priority: 1;
      data: HotStreakData;
    }
  | {
      type: 'cold-streak';
      priority: 2;
      data: ColdStreakData;
    }
  | {
      type: 'improving';
      priority: 3;
      data: ImprovingData;
    }
  | {
      type: 'declining';
      priority: 4;
      data: DecliningData;
    }
  | {
      type: 'near-milestone';
      priority: 5;
      data: NearMilestoneData;
    };
