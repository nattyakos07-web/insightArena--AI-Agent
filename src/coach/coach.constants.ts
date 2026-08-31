export const MAX_INSIGHT_MESSAGE_LENGTH = 280;
export const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export const INSIGHT_BLOCKLIST: readonly string[] = [
  'bet more',
  'double down',
  'guaranteed',
  'sure thing',
  'cash out',
  "can't lose",
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

export function containsInsightBlockedPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  return INSIGHT_BLOCKLIST.some((phrase) => lower.includes(phrase));
}
