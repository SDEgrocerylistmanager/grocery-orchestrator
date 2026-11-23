const assert = require('node:assert/strict');
const { test } = require('node:test');
const request = require('supertest');
const { createApp } = require('../src/app');
const { createSsoClient } = require('../src/clients/ssoClient');
const { HttpError } = require('../src/httpError');

const user = { id: 'sub-1', username: 'anna', email: 'anna@example.com', exp: 4102444800 };

// /me also reads the profile kept by the backend
const backendClient = { getMe: async () => ({ id: 'sub-1', telegram_chat_id: null }) };

function appWith(verify) {
    return createApp({ ssoClient: { verify }, backendClient });
}

test('health does not need a token', async () => {
    const res = await request(appWith(async () => user)).get('/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: 'ok' });
});

test('missing or malformed Authorization header gives 401', async () => {
    const app = appWith(async () => user);
    assert.equal((await request(app).get('/api/v1/me')).status, 401);
    assert.equal((await request(app).get('/api/v1/me').set('Authorization', 'Basic abc')).status, 401);
    assert.equal((await request(app).get('/api/v1/me').set('Authorization', 'Bearer')).status, 401);
});

test('a valid token reaches the route and the token is forwarded to the SSO', async () => {
    let received;
    const app = appWith(async (token) => { received = token; return user; });
    const res = await request(app).get('/api/v1/me').set('Authorization', 'Bearer good');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.id, 'sub-1');
    assert.equal(received, 'good');
});

test('a token refused by the SSO gives 401', async () => {
    const app = appWith(async () => { throw new HttpError(401, 'Invalid or expired token.'); });
    const res = await request(app).get('/api/v1/me').set('Authorization', 'Bearer bad');
    assert.equal(res.status, 401);
});

test('SSO unavailable gives 503', async () => {
    const app = appWith(async () => { throw new HttpError(503, 'Authentication service unavailable.'); });
    const res = await request(app).get('/api/v1/me').set('Authorization', 'Bearer x');
    assert.equal(res.status, 503);
});

test('unknown route gives 404', async () => {
    const res = await request(appWith(async () => user)).get('/nope');
    assert.equal(res.status, 404);
});

test('ssoClient maps SSO answers', async () => {
    const make = (impl) => createSsoClient({ baseUrl: 'http://sso', timeoutMs: 100, fetchImpl: impl });
    const answer = (status, body = {}) => async () => new Response(JSON.stringify(body), { status });

    const ok = await make(answer(200, { sub: 's', preferred_username: 'u', email: 'e', exp: 1 })).verify('t');
    assert.deepEqual(ok, { id: 's', username: 'u', email: 'e', exp: 1 });

    await assert.rejects(make(answer(401)).verify('t'), { status: 401 });
    await assert.rejects(make(answer(503)).verify('t'), { status: 503 });
    await assert.rejects(make(answer(500)).verify('t'), { status: 502 });
    await assert.rejects(make(async () => { throw new Error('down'); }).verify('t'), { status: 503 });
});
