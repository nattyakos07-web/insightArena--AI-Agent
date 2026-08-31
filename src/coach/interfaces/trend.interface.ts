/**
 * Domain types for the streak and trend detection feature.
 */

export type PredictionOutcome = boolean;

export interface UserPerformance {
  history: PredictionOutcome[];
  personalBestStreak: number;
}

export type SignalType =
  | 'hot-streak'
  | 'cold-streak'
  | 'improving'
  | 'declining'
  | 'near-milestone';

export type SignalPriority = 1 | 2 | 3 | 4 | 5;

export interface HotStreakData {
  streakLength: number;
}

export interface ColdStreakData {
  streakLength: number;
}

export interface ImprovingData {
  recentAccuracy: number;
  overallAccuracy: number;
  delta: number;
}

export interface DecliningData {
  recentAccuracy: number;
  overallAccuracy: number;
  delta: number;
}

export interface NearMilestoneData {
  milestoneType: 'total-predictions' | 'personal-best-streak';
  milestoneValue: number;
  predictionsAway: number;
  currentTotal?: number;
  currentStreak?: number;
}

export type TrendSignal =
  | { type: 'hot-streak'; priority: 1; data: HotStreakData }
  | { type: 'cold-streak'; priority: 2; data: ColdStreakData }
  | { type: 'improving'; priority: 3; data: ImprovingData }
  | { type: 'declining'; priority: 4; data: DecliningData }
  | { type: 'near-milestone'; priority: 5; data: NearMilestoneData };
