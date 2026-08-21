/**
 * Constants for the CoachService.
 *
 * INSIGHT_BLOCKLIST: gambling-encouragement phrases that must never appear in
 * a generated coaching insight.  Enforced post-generation in code — the LLM
 * prompt is the first line of defence, this check is the hard backstop.
 */

/** Maximum character length for any single coaching message. */
export const MAX_INSIGHT_MESSAGE_LENGTH = 280;

/**
 * Gambling-encouragement / dangerous phrases that are hard-blocked from
 * appearing in any coaching insight message.
 *
 * Matching is case-insensitive, whole-phrase (substring) search so that
 * compound phrases like "bet more" are not fragmented.
 */
export const INSIGHT_BLOCKLIST: readonly string[] = [
  'bet more',
  'double down',
  'guaranteed',
  'sure thing',
  'cash out',
  'can\'t lose',
  'cannot lose',
  'risk it',
  'wager',
  'place a bet',
  'all in',
  'all-in',
  'jackpot',
  'stake',
  'odds',
  'profit',
  'payout',
  'sure win',
  'easy money',
  'free money',
];

/**
 * Returns true if `text` contains any gambling-encouragement phrase
 * (case-insensitive substring match).
 */
export function containsInsightBlockedPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  return INSIGHT_BLOCKLIST.some((phrase) => lower.includes(phrase));
}
