import { UserPerformance, TrendSignal } from '../interfaces/trend.interface';

export function buildCoachingInsightPrompt(
  performance: UserPerformance,
  signals: TrendSignal[],
): { system: string; user: string } {
  const system = [
    'You are InsightArena Coach — a warm, encouraging performance analyst for a sports prediction platform.',
    'You MUST respond with a single valid JSON object and nothing else — no prose, no markdown fences.',
    'The JSON must have exactly this shape:',
    '  { "insights": [ { "message": string, "signalType": string, "priority": number } ] }',
    '',
    'RULES:',
    '- Each message must be ≤ 280 characters.',
    '- Use "you" to address the user directly. Be encouraging and specific — reference actual numbers.',
    '- Do NOT give financial advice or recommend wagering money.',
    '- Do NOT use: "bet more", "double down", "guaranteed", "sure thing", "cash out", "can\'t lose",',
    '  "risk it", "wager", "place a bet", "all in", "jackpot", "stake", "odds", "profit".',
    '- signalType must be one of: hot-streak | cold-streak | improving | declining | near-milestone.',
    '- priority must be 1 (informational), 2 (notable), or 3 (high-priority).',
    '- Generate one insight per signal (max 3 total).',
  ].join('\n');

  const totalPredictions = performance.history.length;
  const correctPredictions = performance.history.filter(Boolean).length;
  const overallAccuracy =
    totalPredictions > 0 ? Math.round((correctPredictions / totalPredictions) * 100) : 0;

  const signalLines = signals
    .map((s) => {
      switch (s.type) {
        case 'hot-streak':
          return `- HOT STREAK: ${s.data.streakLength} correct predictions in a row.`;
        case 'cold-streak':
          return `- COLD STREAK: ${s.data.streakLength} incorrect predictions in a row.`;
        case 'improving':
          return `- IMPROVING: Recent accuracy ${s.data.recentAccuracy}% vs overall ${s.data.overallAccuracy}% (+${s.data.delta}pp).`;
        case 'declining':
          return `- DECLINING: Recent accuracy ${s.data.recentAccuracy}% vs overall ${s.data.overallAccuracy}% (-${s.data.delta}pp).`;
        case 'near-milestone':
          return s.data.milestoneType === 'personal-best-streak'
            ? `- NEAR MILESTONE: ${s.data.predictionsAway} pick(s) away from beating personal best streak of ${s.data.milestoneValue}.`
            : `- NEAR MILESTONE: ${s.data.predictionsAway} pick(s) away from ${s.data.milestoneValue} total predictions.`;
      }
    })
    .join('\n');

  const user = [
    `Total predictions: ${totalPredictions}`,
    `Overall accuracy: ${overallAccuracy}%`,
    `Personal best streak: ${performance.personalBestStreak}`,
    '',
    'Detected signals:',
    signalLines,
    '',
    'Return the JSON now.',
  ].join('\n');

  return { system, user };
}
