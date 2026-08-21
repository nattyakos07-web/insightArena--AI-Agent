/**
 * Domain types for LLM-powered personalized coaching insights.
 *
 * CoachingInsight is the validated output shape produced by CoachService
 * after the LLM generation + post-generation enforcement pipeline.
 */

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/**
 * A single personalized coaching message surfaced to the user.
 *
 * Hard constraints (enforced in code, not just the prompt):
 *   - `message` must be ≤ 280 characters
 *   - `message` must not contain any term from the gambling-encouragement
 *     blocklist (see `INSIGHT_BLOCKLIST` in coach.constants.ts)
 *   - `signalType` must match one of the TrendSignal types that drove the insight
 */
export interface CoachingInsight {
  /**
   * The human-facing coaching message.
   * Tone: encouraging, concrete, never financial advice.
   * Hard limit: 280 characters.
   */
  message: string;

  /**
   * Which trend signal this insight is responding to.
   * Matches the `TrendSignal['type']` discriminator.
   */
  signalType: 'hot-streak' | 'cold-streak' | 'improving' | 'declining' | 'near-milestone';

  /**
   * Rough importance score (1–3) assigned by the LLM.
   * 1 = informational, 2 = notable, 3 = high-priority.
   * Used only for client-side prioritisation; not enforced server-side.
   */
  priority: 1 | 2 | 3;
}

// ---------------------------------------------------------------------------
// LLM response wrapper
// ---------------------------------------------------------------------------

/**
 * The JSON shape the LLM is asked to return.
 * Validated at runtime before any insight is accepted.
 */
export interface LlmInsightResponse {
  /** 1–3 coaching insights. */
  insights: CoachingInsight[];
}
