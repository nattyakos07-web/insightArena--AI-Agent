import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CoachService } from './coach.service';
import { CoachInsightsResponseDto } from './dto/coach-insights-response.dto';
import { UserPerformance } from './interfaces/trend.interface';
import { CACHE_TTL_MS } from './coach.constants';

// ---------------------------------------------------------------------------
// Simulated user store
// ---------------------------------------------------------------------------
// In production this would query a users / predictions database.
// For now we use a deterministic in-memory map so the endpoint is testable
// without a real database.  Unknown userIds return 404.

const KNOWN_USERS: Record<string, UserPerformance> = {
  // Seeded E2E user (same UUID used in test/e2e/create-e2e-app.ts)
  '550e8400-e29b-41d4-a716-446655440001': {
    history: [true, true, false, true, true, true, true, false, true, true, true, true],
    personalBestStreak: 5,
  },
};

// ---------------------------------------------------------------------------
// Cache entry
// ---------------------------------------------------------------------------

interface CacheEntry {
  response: CoachInsightsResponseDto;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class CoachInsightsService {
  private readonly logger = new Logger(CoachInsightsService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly coachService: CoachService) {}

  /**
   * Returns coaching insights for `userId`.
   *
   * - Throws `NotFoundException` (404) if the userId is not recognised.
   * - Serves from the in-memory cache if a non-expired entry exists AND
   *   `refresh` is false.
   * - On a cache miss (or forced refresh) calls `CoachService.generateInsights`,
   *   caches the result for 1 hour, and returns it.
   */
  async getInsights(userId: string, refresh = false): Promise<CoachInsightsResponseDto> {
    const performance = KNOWN_USERS[userId];
    if (!performance) {
      throw new NotFoundException(`User '${userId}' not found`);
    }

    // Cache hit
    if (!refresh) {
      const entry = this.cache.get(userId);
      if (entry && Date.now() < entry.expiresAt) {
        this.logger.debug(`Cache hit for user ${userId}`);
        return { ...entry.response, cached: true };
      }
    }

    // Cache miss or forced refresh — generate fresh insights
    this.logger.debug(`Generating fresh insights for user ${userId} (refresh=${refresh})`);
    const insights = await this.coachService.generateInsights(performance);

    const response: CoachInsightsResponseDto = {
      userId,
      generatedAt: new Date().toISOString(),
      cached: false,
      insights,
    };

    this.cache.set(userId, {
      response,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return response;
  }

  /** Exposed for testing — evicts a specific user's cache entry. */
  evictCache(userId: string): void {
    this.cache.delete(userId);
  }

  /** Exposed for testing — clears the entire cache. */
  clearCache(): void {
    this.cache.clear();
  }
}
