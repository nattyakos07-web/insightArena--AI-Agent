import { ApiProperty } from '@nestjs/swagger';

// ---------------------------------------------------------------------------
// CoachingInsightDto — one insight item in the response array
// ---------------------------------------------------------------------------

export class CoachingInsightDto {
  @ApiProperty({
    description: 'Personalized coaching message. Max 280 characters. Encouraging and concrete.',
    example: "You're on a 6-prediction winning streak! Your recent form is excellent — keep trusting your analysis.",
    maxLength: 280,
  })
  message: string;

  @ApiProperty({
    description: 'The trend signal type that triggered this insight.',
    enum: ['hot-streak', 'cold-streak', 'improving', 'declining', 'near-milestone'],
    example: 'hot-streak',
  })
  signalType: 'hot-streak' | 'cold-streak' | 'improving' | 'declining' | 'near-milestone';

  @ApiProperty({
    description: 'Importance score: 1 = informational, 2 = notable, 3 = high-priority.',
    enum: [1, 2, 3],
    example: 3,
  })
  priority: 1 | 2 | 3;
}

// ---------------------------------------------------------------------------
// CoachInsightsResponseDto — the full GET /insights/:userId response body
// ---------------------------------------------------------------------------

export class CoachInsightsResponseDto {
  @ApiProperty({
    description: 'The user ID the insights were generated for.',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  userId: string;

  @ApiProperty({
    description: 'ISO 8601 timestamp of when the insights were generated.',
    example: '2026-08-21T20:00:00.000Z',
  })
  generatedAt: string;

  @ApiProperty({
    description: 'Whether this response was served from the in-memory cache.',
    example: false,
  })
  cached: boolean;

  @ApiProperty({
    description: '1–3 personalized coaching insights based on the user\'s prediction history.',
    type: [CoachingInsightDto],
    example: [
      {
        message: "You're on a 6-prediction winning streak! Your recent form is excellent — keep trusting your analysis.",
        signalType: 'hot-streak',
        priority: 3,
      },
      {
        message: "You're 1 correct pick away from beating your personal best streak of 6. Stay focused.",
        signalType: 'near-milestone',
        priority: 3,
      },
    ],
  })
  insights: CoachingInsightDto[];
}
