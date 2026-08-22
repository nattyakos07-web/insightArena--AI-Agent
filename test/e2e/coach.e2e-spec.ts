import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createE2eApp, userId, unknownUserId, capturedLlmMock } from './create-e2e-app';
import { ADMIN_API_KEY_HEADER } from '../../src/common/guards/admin-api-key.guard';

const TEST_ADMIN_KEY = 'test-admin-secret-key';

describe('GET /api/v1/coach/insights/:userId (e2e)', () => {
  let app: INestApplication;

  // Use a fresh app per test so the in-memory cache is clean each time.
  beforeEach(async () => {
    // Set the admin key env var for tests that need it.
    process.env.ADMIN_API_KEY = TEST_ADMIN_KEY;
    app = await createE2eApp();
  });

  afterEach(async () => {
    delete process.env.ADMIN_API_KEY;
    await app.close();
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('returns insights for a known user', async () => {
    const { body } = await request(app.getHttpServer())
      .get(`/api/v1/coach/insights/${userId}`)
      .expect(200);

    expect(body).toMatchObject({ userId, cached: false });
    expect(body.generatedAt).toBeDefined();
    expect(Array.isArray(body.insights)).toBe(true);
    expect(body.insights.length).toBeGreaterThanOrEqual(1);
    expect(body.insights.length).toBeLessThanOrEqual(3);

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
  // Cache hit — second call must return cached: true and make zero extra LLM calls
  // -------------------------------------------------------------------------

  it('serves the second request from cache (cached: true) and makes zero extra LLM calls', async () => {
    // First call — populates cache, LLM is called once
    await request(app.getHttpServer())
      .get(`/api/v1/coach/insights/${userId}`)
      .expect(200);

    const llmCallsAfterFirst = (capturedLlmMock?.complete as jest.Mock).mock.calls.length;

    // Second call — must hit cache
    const { body } = await request(app.getHttpServer())
      .get(`/api/v1/coach/insights/${userId}`)
      .expect(200);

    expect(body.cached).toBe(true);
    expect(body.userId).toBe(userId);

    // No additional LLM calls on a cache hit
    const llmCallsAfterSecond = (capturedLlmMock?.complete as jest.Mock).mock.calls.length;
    expect(llmCallsAfterSecond).toBe(llmCallsAfterFirst);
  });

  // -------------------------------------------------------------------------
  // ?refresh=true bypasses cache (admin key required)
  // -------------------------------------------------------------------------

  it('?refresh=true with valid admin key bypasses the cache and returns fresh insights (cached: false)', async () => {
    // Warm the cache
    await request(app.getHttpServer())
      .get(`/api/v1/coach/insights/${userId}`)
      .expect(200);

    // Force refresh with a valid admin key
    const { body } = await request(app.getHttpServer())
      .get(`/api/v1/coach/insights/${userId}?refresh=true`)
      .set(ADMIN_API_KEY_HEADER, TEST_ADMIN_KEY)
      .expect(200);

    expect(body.cached).toBe(false);
    expect(body.userId).toBe(userId);
  });

  it('?refresh=true without admin key returns 403 in the standard error shape', async () => {
    const { body } = await request(app.getHttpServer())
      .get(`/api/v1/coach/insights/${userId}?refresh=true`)
      .expect(403);

    expect(body).toMatchObject({
      statusCode: 403,
      error: 'Forbidden',
    });
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('path');
  });

  it('?refresh=true with a wrong admin key returns 403', async () => {
    const { body } = await request(app.getHttpServer())
      .get(`/api/v1/coach/insights/${userId}?refresh=true`)
      .set(ADMIN_API_KEY_HEADER, 'wrong-key')
      .expect(403);

    expect(body).toMatchObject({
      statusCode: 403,
      error: 'Forbidden',
    });
  });

  // -------------------------------------------------------------------------
  // 404 — unknown user
  // -------------------------------------------------------------------------

  it('returns 404 with the standard error shape for an unknown userId', async () => {
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
  // 400 — invalid userId format
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
