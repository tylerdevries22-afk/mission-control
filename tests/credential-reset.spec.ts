import { test, expect } from '@playwright/test'
import { API_KEY_HEADER, createTestUser, deleteTestUser } from './helpers'

test('password reset rejects weak input and revokes an already authenticated client', async ({ request, playwright, baseURL }) => {
  const created = await createTestUser(request)
  expect(created.res.status()).toBe(201)
  const client = await playwright.request.newContext({ baseURL })
  try {
    const login = await client.post('/api/auth/login', {
      data: { username: created.username, password: 'e2e-testpass-123' },
    })
    expect(login.status()).toBe(200)
    expect((await client.get('/api/auth/me')).status()).toBe(200)

    const weakReset = await request.put('/api/auth/users', {
      headers: API_KEY_HEADER, data: { id: created.id, password: 'short' },
    })
    expect(weakReset.status()).toBe(400)
    expect((await client.get('/api/auth/me')).status()).toBe(200)

    const reset = await request.put('/api/auth/users', {
      headers: API_KEY_HEADER, data: { id: created.id, password: 'e2e-new-testpass-123' },
    })
    expect(reset.status()).toBe(200)
    expect((await client.get('/api/auth/me')).status()).toBe(401)
    expect((await client.post('/api/auth/login', {
      data: { username: created.username, password: 'e2e-new-testpass-123' },
    })).status()).toBe(200)
  } finally {
    await client.dispose()
    await deleteTestUser(request, created.id)
  }
})

test('user updates reject ambiguous identities and invalid approval values', async ({ request }) => {
  for (const data of [{ id: '1abc' }, { id: 1, is_approved: '0' }, { id: 1, password: {} }]) {
    const response = await request.put('/api/auth/users', { headers: API_KEY_HEADER, data })
    expect(response.status()).toBe(400)
  }
  const deletion = await request.delete('/api/auth/users', { headers: API_KEY_HEADER, data: { id: '1abc' } })
  expect(deletion.status()).toBe(400)
})
