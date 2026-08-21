import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createE2eApp, userId, unknownUserId } from './create-e2e-app';

describe('GET /api/v1/coach/insights/:userId (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await createE2eApp();
  });

  afterEach(async () => {
    await app.close();
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('returns insights for a known user', async () => {
    const { body } = await request(app.getHttpServer())
      .get(`/api/v1/coach/insights/${userId}`)
      .expect(200);

    expect(body).toMatchObject({
      userId,
      cached: false,
    });
    expect(body.generatedAt).toBeDefined();
    expect(Array.isArray(body.insights)).toBe(true);
    expect(body.insights.length).toBeGreaterThanOrEqual(1);
    expect(body.insights.length).toBeLessThanOrEqual(3);

    // Each insight must conform to the schema
    for (const insight of body.insights) {
      expect(typeof insight.message).toBe('string');
      expect(insight.message.length).toBeGreaterThan(0);
      expect(insight.message.length).toBeLessThanOrEqual(280);
      expect(['hot-streak', 'cold-streak', 'improving', 'declining', 'near-milestone']).toContain(
        insight.signalType,
      );
      expect([1, 2, 3]).toContain(insight.priority);
    }
  });

  // -------------------------------------------------------------------------
  // Cache hit — second call must make zero LLM completions
  // -------------------------------------------------------------------------

  it('serves the second request from cache and makes zero LLM calls', async () => {
    // First call — populates cache
    await request(app.getHttpServer())
      .get(`/api/v1/coach/insights/${userId}`)
      .expect(200);

    // Retrieve the mock so we can count calls
    const { llmService } = await import('./create-e2e-app').then((m) => ({
      llmService: m.capturedLlmMock,
    }));

    const callsAfterFirst = (llmService?.complete as jest.Mock)?.mock.calls.length ?? 0;

    // Second call — should hit cache
    const { body } = await request(app.getHttpServer())
      .get(`/api/v1/coach/insights/${userId}`)
      .expect(200);

    expect(body.cached).toBe(true);

    const callsAfterSecond = (llmService?.complete as jest.Mock)?.mock.calls.length ?? 0;
    // No additional LLM calls made on the cache-hit request
    expect(callsAfterSecond).toBe(callsAfterFirst);
  });

  // -------------------------------------------------------------------------
  // ?refresh=true bypasses cache
  // -------------------------------------------------------------------------

  it('?refresh=true bypasses the cache and returns cached: false', async () => {
    // Warm the cache
    await request(app.getHttpServer())
      .get(`/api/v1/coach/insights/${userId}`)
      .expect(200);

    // Force refresh
    const { body } = await request(app.getHttpServer())
      .get(`/api/v1/coach/insights/${userId}?refresh=true`)
      .expect(200);

    expect(body.cached).toBe(false);
    expect(body.userId).toBe(userId);
  });

  // -------------------------------------------------------------------------
  // 404 — unknown user
  // -------------------------------------------------------------------------

  it('returns 404 for an unknown userId', async () => {
    const { body } = await request(app.getHttpServer())
      .get(`/api/v1/coach/insights/${unknownUserId}`)
      .expect(404);

    expect(body).toMatchObject({
      statusCode: 404,
      error: 'Not Found',
    });
    expect(body.message).toContain(unknownUserId);
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('path');
  });

  // -------------------------------------------------------------------------
  // 400 — invalid userId format (not a UUID)
  // -------------------------------------------------------------------------

  it('returns 400 when userId is not a valid UUID', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/coach/insights/not-a-uuid')
      .expect(400);

    expect(body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
    });
    expect(body).toHaveProperty('timestamp');
  });
});
