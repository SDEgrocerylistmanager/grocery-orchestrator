const assert = require('node:assert/strict');
const { test } = require('node:test');
const request = require('supertest');
const { createApp } = require('../src/app');
const { HttpError } = require('../src/httpError');

const user = { id: 'sub-1', username: 'anna', email: null, exp: 4102444800 };
const auth = ['Authorization', 'Bearer tok'];

const items = [
    { id: 1, list_id: 7, item_name: 'milk', category: null, quantity: '2.00' },
    { id: 2, list_id: 7, item_name: 'soap', category: 'Household', quantity: '1.00' },
    { id: 3, list_id: 7, item_name: 'bananas', category: null, quantity: '6.00' },
];
const guesses = { milk: 'Dairy', bananas: 'Produce' };

function setup({ updateItem, categorize, getAllItems } = {}) {
    const patches = [];
    const categorizerCalls = [];
    const backend = {
        getAllItems: getAllItems || (async () => items.map((i) => ({ ...i }))),
        updateItem: updateItem || (async (token, listId, itemId, body) => {
            patches.push({ token, listId, itemId, body });
            const item = items.find((i) => String(i.id) === itemId);
            return { data: { ...item, ...body } };
        }),
    };
    const categorizer = {
        categorize: categorize || (async (list) => {
            categorizerCalls.push(list);
            return list.map((i) => ({ ...i, department: guesses[i.name] || 'Other', source: 'keyword' }));
        }),
        departments: async () => ['Produce', 'Dairy', 'Household', 'Other'],
    };
    const app = createApp({
        ssoClient: { verify: async () => user }, backendClient: backend, categorizerClient: categorizer,
    });
    return { app, patches, categorizerCalls };
}

test('only items without a category are sent and saved', async () => {
    const { app, patches, categorizerCalls } = setup();
    const res = await request(app).post('/api/v1/lists/7/categorize').set(...auth);

    assert.equal(res.status, 200);
    assert.deepEqual(categorizerCalls[0], [{ name: 'milk', quantity: '2.00' }, { name: 'bananas', quantity: '6.00' }]);
    assert.deepEqual(
        patches.map((p) => [p.listId, p.itemId, p.body.category]).sort(),
        [['7', '1', 'Dairy'], ['7', '3', 'Produce']],
    );
    assert.equal(patches[0].token, 'tok');
    assert.deepEqual(res.body.data.summary, { categorized: 2, skipped: 1, failed: [] });
    assert.deepEqual(res.body.data.items.map((i) => i.category), ['Dairy', 'Household', 'Produce']);
});

test('nothing to do: the categorizer is not called', async () => {
    const done = items.map((i) => ({ ...i, category: 'Other' }));
    const { app, categorizerCalls, patches } = setup({ getAllItems: async () => done });
    const res = await request(app).post('/api/v1/lists/7/categorize').set(...auth);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.summary, { categorized: 0, skipped: 3, failed: [] });
    assert.equal(categorizerCalls.length, 0);
    assert.equal(patches.length, 0);
});

test('categorizer down: 503 and nothing is written', async () => {
    const { app, patches } = setup({ categorize: async () => { throw new HttpError(503, 'Categorizer unavailable.'); } });
    const res = await request(app).post('/api/v1/lists/7/categorize').set(...auth);
    assert.equal(res.status, 503);
    assert.equal(patches.length, 0);
});

test('a failed save is reported and the others are kept', async () => {
    const updateItem = async (token, listId, itemId, body) => {
        if (itemId === '1') throw new HttpError(400, 'A referenced record does not exist.');
        return { data: { ...items.find((i) => String(i.id) === itemId), ...body } };
    };
    const { app } = setup({ updateItem });
    const res = await request(app).post('/api/v1/lists/7/categorize').set(...auth);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.summary.categorized, 1);
    assert.deepEqual(res.body.data.summary.failed, [{
        item_id: 1, item_name: 'milk', category: 'Dairy', error: 'A referenced record does not exist.',
    }]);
    // The failed item keeps its old (null) category in the answer
    assert.deepEqual(res.body.data.items.map((i) => i.category), [null, 'Household', 'Produce']);
});

test('a list of another user is 404', async () => {
    const { app } = setup({ getAllItems: async () => { throw new HttpError(404, 'List not found.'); } });
    const res = await request(app).post('/api/v1/lists/7/categorize').set(...auth);
    assert.equal(res.status, 404);
});

test('invalid list id is 400', async () => {
    const { app } = setup();
    assert.equal((await request(app).post('/api/v1/lists/x/categorize').set(...auth)).status, 400);
});

test('GET /departments comes from the categorizer', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/v1/departments').set(...auth);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, ['Produce', 'Dairy', 'Household', 'Other']);
});
