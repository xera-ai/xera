import { type APIRequestContext, expect, test } from '@playwright/test';
import { newAuthedContext } from '@xera-ai/http/runtime';

test.describe('POST /users validation', () => {
  let api: APIRequestContext;
  test.beforeAll(async ({ playwright }) => {
    api = await newAuthedContext(playwright, 'user');
  });
  test.afterAll(async () => {
    await api.dispose();
  });

  test('Reject malformed email', async () => {
    const res = await api.post('/users', { data: { email: 'not-an-email' } });
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.errors).toBeInstanceOf(Array);
  });

  test('Accept valid email', async () => {
    const res = await api.post('/users', {
      data: { email: `alice-${process.env.XERA_RUN_ID}@example.com` },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('email');
  });
});
