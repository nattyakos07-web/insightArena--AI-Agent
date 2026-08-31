/**
 * Domain types for LLM-powered personalized coaching insights.
 */

export interface CoachingInsight {
  /** Human-facing coaching message. Max 280 characters. */
  message: string;
  /** Which trend signal this insight responds to. */
  signalType: 'hot-streak' | 'cold-streak' | 'improving' | 'declining' | 'near-milestone';
  /** Importance: 1 = informational, 2 = notable, 3 = high-priority. */
  priority: 1 | 2 | 3;
}

export interface LlmInsightResponse {
  insights: CoachingInsight[];
}
