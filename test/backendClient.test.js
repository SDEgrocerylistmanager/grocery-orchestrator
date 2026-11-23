const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createBackendClient, PAGE_SIZE } = require('../src/clients/backendClient');

// Fake fetch that records the calls and answers with the given responses in order.
function fakeFetch(responses) {
    const calls = [];
    const impl = async (url, options) => {
        calls.push({ url, ...options, body: options.body && JSON.parse(options.body) });
        const [status, body] = responses.shift();
        return new Response(body === undefined ? null : JSON.stringify(body), { status });
    };
    return { impl, calls };
}

function client(responses) {
    const fake = fakeFetch(responses);
    return { backend: createBackendClient({ baseUrl: 'http://be', timeoutMs: 100, fetchImpl: fake.impl }), calls: fake.calls };
}

test('sends method, path, query, body and the bearer token', async () => {
    const { backend, calls } = client([[200, { data: [] }], [201, { data: { id: 7 } }]]);
    await backend.listLists('tok', { limit: '10', offset: '20' });
    await backend.createList('tok', { list_name: 'Spesa' });

    assert.equal(calls[0].url, 'http://be/api/v1/lists?limit=10&offset=20');
    assert.equal(calls[0].method, 'GET');
    assert.equal(calls[0].headers.Authorization, 'Bearer tok');
    assert.equal(calls[1].method, 'POST');
    assert.equal(calls[1].headers['Content-Type'], 'application/json');
    assert.deepEqual(calls[1].body, { list_name: 'Spesa' });
});

test('204 answers return null', async () => {
    const { backend } = client([[204]]);
    assert.equal(await backend.deleteList('tok', '1'), null);
});

test('getAllItems reads every page', async () => {
    const full = Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: i }));
    const { backend, calls } = client([[200, { data: full }], [200, { data: [{ id: 'last' }] }]]);
    const items = await backend.getAllItems('tok', '3');

    assert.equal(items.length, PAGE_SIZE + 1);
    assert.equal(calls[0].url, `http://be/api/v1/lists/3/items?limit=${PAGE_SIZE}&offset=0`);
    assert.equal(calls[1].url, `http://be/api/v1/lists/3/items?limit=${PAGE_SIZE}&offset=${PAGE_SIZE}`);
});

test('backend client errors pass through with their message', async () => {
    for (const status of [400, 404, 409]) {
        const { backend } = client([[status, { error: `msg ${status}` }]]);
        await assert.rejects(backend.getList('tok', '1'), { status, message: `msg ${status}` });
    }
});

test('credential refusals and server errors become gateway errors', async () => {
    const cases = [[401, 502], [403, 502], [500, 502], [503, 503]];
    for (const [given, expected] of cases) {
        const { backend } = client([[given, { error: 'x' }]]);
        await assert.rejects(backend.getList('tok', '1'), { status: expected });
    }
});

test('network failure becomes 503', async () => {
    const backend = createBackendClient({
        baseUrl: 'http://be', timeoutMs: 100, fetchImpl: async () => { throw new Error('down'); },
    });
    await assert.rejects(backend.getList('tok', '1'), { status: 503, message: 'Backend unavailable.' });
});
