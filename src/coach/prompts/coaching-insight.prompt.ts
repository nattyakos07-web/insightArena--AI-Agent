import { UserPerformance, TrendSignal } from '../interfaces/trend.interface';

/**
 * Builds the coaching-insight prompt for the LLM.
 *
 * The model is asked to return strict JSON with 1–3 coaching insights.
 * Post-generation enforcement (length, blocklist) happens in CoachService;
 * these instructions are the first line of defence.
 */
export function buildCoachingInsightPrompt(
  performance: UserPerformance,
  signals: TrendSignal[],
): { system: string; user: string } {
  const system = [
    'You are InsightArena Coach — a warm, encouraging performance analyst for a sports prediction platform.',
    'A user has just had their recent prediction history analysed and one or more trend signals have been detected.',
    'Your job is to turn those signals into 1–3 short, personal coaching messages that motivate continued engagement.',
    '',
    'RESPONSE FORMAT:',
    'You MUST respond with a single valid JSON object and nothing else — no prose, no markdown fences.',
    'The JSON object MUST have exactly this shape:',
    '  {',
    '    "insights": [',
    '      {',
    '        "message": string,     // ≤ 280 characters, personal, concrete, encouraging',
    '        "signalType": string,  // one of: hot-streak | cold-streak | improving | declining | near-milestone',
    '        "priority": number     // 1 (informational) | 2 (notable) | 3 (high-priority)',
    '      }',
    '    ]',
    '  }',
    '',
    'TONE RULES (critical):',
    '- Be encouraging and specific — reference the actual numbers from the signal data.',
    '- Use "you" to address the user directly and personally.',
    '- Keep each message under 280 characters.',
    '- Do NOT give financial advice, investment advice, or any advice to wager money.',
    '- Do NOT use any gambling-encouragement phrasing such as:',
    '  "bet more", "double down", "guaranteed", "sure thing", "cash out", "stake", "odds",',
    '  "profit", "jackpot", "can\'t lose", "risk it", "wager", "place a bet", "all in".',
    '- Do NOT use profanity or offensive language.',
    '- Do NOT invent data — only reference numbers that appear in the provided signal context.',
    '- Generate exactly one insight per detected signal (max 3 total).',
  ].join('\n');

  const totalPredictions = performance.history.length;
  const correctPredictions = performance.history.filter(Boolean).length;
  const overallAccuracy =
    totalPredictions > 0
      ? Math.round((correctPredictions / totalPredictions) * 100)
      : 0;

  const signalLines = signals
    .map((signal) => {
      switch (signal.type) {
        case 'hot-streak':
          return `- HOT STREAK: User has ${signal.data.streakLength} correct predictions in a row.`;
        case 'cold-streak':
          return `- COLD STREAK: User has ${signal.data.streakLength} incorrect predictions in a row. Help them refocus positively.`;
        case 'improving':
          return (
            `- IMPROVING: Recent accuracy is ${signal.data.recentAccuracy}% vs overall ${signal.data.overallAccuracy}% ` +
            `(+${signal.data.delta} percentage points improvement).`
          );
        case 'declining':
          return (
            `- DECLINING: Recent accuracy is ${signal.data.recentAccuracy}% vs overall ${signal.data.overallAccuracy}% ` +
            `(-${signal.data.delta} percentage points decline). Help them see the bigger picture.`
          );
        case 'near-milestone':
          if (signal.data.milestoneType === 'personal-best-streak') {
            return (
              `- NEAR MILESTONE: User is ${signal.data.predictionsAway} prediction(s) away from beating their ` +
              `personal best streak of ${signal.data.milestoneValue}.`
            );
          }
          return (
            `- NEAR MILESTONE: User is ${signal.data.predictionsAway} prediction(s) away from reaching ` +
            `${signal.data.milestoneValue} total predictions (currently at ${signal.data.currentTotal ?? totalPredictions}).`
          );
      }
    })
    .join('\n');

  const user = [
    'USER PERFORMANCE CONTEXT:',
    `- Total predictions made: ${totalPredictions}`,
    `- Overall accuracy: ${overallAccuracy}%`,
    `- Personal best streak: ${performance.personalBestStreak}`,
    '',
    'DETECTED SIGNALS:',
    signalLines,
    '',
    'Generate 1–3 coaching insights (one per signal) as described. Return the JSON now.',
  ].join('\n');

  return { system, user };
}
