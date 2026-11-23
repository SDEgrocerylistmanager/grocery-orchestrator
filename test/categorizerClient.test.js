const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createCategorizerClient, BATCH_SIZE, MAX_NAME } = require('../src/clients/categorizerClient');

// Echo categorizer: answers each item with department "Dairy", like the real service shape.
function echoFetch(calls) {
    return async (url, options) => {
        const body = options.body && JSON.parse(options.body);
        calls.push({ url, method: options.method, body });
        const items = body.items.map((i) => ({ ...i, department: 'Dairy', source: 'keyword' }));
        return new Response(JSON.stringify({ items }), { status: 200 });
    };
}

function client(fetchImpl) {
    return createCategorizerClient({ baseUrl: 'http://cat', timeoutMs: 100, fetchImpl });
}

test('converts quantities to numbers and truncates long names', async () => {
    const calls = [];
    const result = await client(echoFetch(calls)).categorize([
        { name: 'milk', quantity: '2.00' },
        { name: 'x'.repeat(MAX_NAME + 50), quantity: null },
    ]);
    assert.equal(calls[0].url, 'http://cat/categorize');
    assert.deepEqual(calls[0].body.items[0], { name: 'milk', quantity: 2 });
    assert.equal(calls[0].body.items[1].name.length, MAX_NAME);
    assert.equal(calls[0].body.items[1].quantity, 1);
    assert.equal(result[0].department, 'Dairy');
});

test('splits long lists in batches and keeps the order', async () => {
    const calls = [];
    const items = Array.from({ length: BATCH_SIZE + 3 }, (_, i) => ({ name: `item${i}`, quantity: 1 }));
    const result = await client(echoFetch(calls)).categorize(items);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].body.items.length, 3);
    assert.equal(result.length, items.length);
    assert.equal(result[BATCH_SIZE + 2].name, `item${BATCH_SIZE + 2}`);
});

test('an answer with a different number of items is rejected', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ items: [] }), { status: 200 });
    await assert.rejects(client(fetchImpl).categorize([{ name: 'a', quantity: 1 }]), { status: 502 });
});

test('errors: unreachable 503, refused 502', async () => {
    await assert.rejects(client(async () => { throw new Error('down'); }).categorize([{ name: 'a' }]), { status: 503 });
    const refuse = async () => new Response(JSON.stringify({ detail: 'x' }), { status: 422 });
    await assert.rejects(client(refuse).categorize([{ name: 'a' }]), { status: 502 });
});

test('departments', async () => {
    const fetchImpl = async () => new Response(JSON.stringify(['Produce', 'Other']), { status: 200 });
    assert.deepEqual(await client(fetchImpl).departments(), ['Produce', 'Other']);
});
