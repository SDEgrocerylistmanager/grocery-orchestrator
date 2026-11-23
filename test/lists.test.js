const assert = require('node:assert/strict');
const { test } = require('node:test');
const request = require('supertest');
const { createApp } = require('../src/app');
const { HttpError } = require('../src/httpError');

const user = { id: 'sub-1', username: 'anna', email: null, exp: 4102444800 };
const auth = ['Authorization', 'Bearer tok'];

// Fake backend: every method records its arguments; behaviour can be overridden.
function setup(overrides = {}) {
    const calls = [];
    const record = (name, result) => async (...args) => {
        calls.push({ name, args });
        return typeof result === 'function' ? result(...args) : result;
    };
    const backend = {
        listLists: record('listLists', { data: [{ id: 1 }], limit: 100, offset: 0 }),
        createList: record('createList', { data: { id: 5, list_name: 'Spesa' } }),
        getList: record('getList', { id: 1, list_name: 'Spesa', last_ts: null }),
        updateList: record('updateList', { data: { id: 1, list_name: 'Nuova' } }),
        deleteList: record('deleteList', null),
        getAllItems: record('getAllItems', [{ id: 10, item_name: 'milk', category: null }]),
        createItem: record('createItem', { data: { id: 11, item_name: 'eggs' } }),
        updateItem: record('updateItem', { data: { id: 10, quantity: 2 } }),
        deleteItem: record('deleteItem', null),
    };
    for (const [name, result] of Object.entries(overrides)) backend[name] = record(name, result);
    const app = createApp({ ssoClient: { verify: async () => user }, backendClient: backend });
    return { app, calls };
}

test('list routes need authentication', async () => {
    const { app, calls } = setup();
    assert.equal((await request(app).get('/api/v1/lists')).status, 401);
    assert.equal(calls.length, 0);
});

test('GET /lists forwards pagination and the token', async () => {
    const { app, calls } = setup();
    const res = await request(app).get('/api/v1/lists?limit=5&offset=10').set(...auth);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, [{ id: 1 }]);
    assert.deepEqual(calls[0].args, ['tok', { limit: '5', offset: '10' }]);
});

test('POST /lists returns 201 with Location', async () => {
    const { app, calls } = setup();
    const res = await request(app).post('/api/v1/lists').set(...auth).send({ list_name: 'Spesa' });
    assert.equal(res.status, 201);
    assert.equal(res.headers.location, '/api/v1/lists/5');
    assert.deepEqual(calls[0].args, ['tok', { list_name: 'Spesa' }]);
});

test('GET /lists/:id composes the list and its items', async () => {
    const { app, calls } = setup();
    const res = await request(app).get('/api/v1/lists/1').set(...auth);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.list_name, 'Spesa');
    assert.deepEqual(res.body.data.items, [{ id: 10, item_name: 'milk', category: null }]);
    assert.deepEqual(calls.map((c) => c.name).sort(), ['getAllItems', 'getList']);
});

test('a list of another user is 404, as the backend says', async () => {
    const notFound = () => { throw new HttpError(404, 'List not found.'); };
    const { app } = setup({ getList: notFound, getAllItems: notFound });
    const res = await request(app).get('/api/v1/lists/99').set(...auth);
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'List not found.');
});

test('invalid ids are rejected before calling the backend', async () => {
    const { app, calls } = setup();
    for (const path of ['/api/v1/lists/abc', '/api/v1/lists/0', '/api/v1/lists/1/items/x', '/api/v1/lists/-1']) {
        const res = await request(app).delete(path).set(...auth);
        assert.equal(res.status, 400, path);
    }
    assert.equal(calls.length, 0);
});

test('PATCH and DELETE of a list', async () => {
    const { app, calls } = setup();
    const patched = await request(app).patch('/api/v1/lists/1').set(...auth).send({ list_name: 'Nuova' });
    assert.equal(patched.status, 200);
    assert.deepEqual(calls[0].args, ['tok', '1', { list_name: 'Nuova' }]);

    const deleted = await request(app).delete('/api/v1/lists/1').set(...auth);
    assert.equal(deleted.status, 204);
});

test('item create, update and delete', async () => {
    const { app, calls } = setup();
    const created = await request(app).post('/api/v1/lists/1/items').set(...auth).send({ item_name: 'eggs' });
    assert.equal(created.status, 201);
    assert.equal(created.headers.location, '/api/v1/lists/1/items/11');

    const updated = await request(app).patch('/api/v1/lists/1/items/10').set(...auth).send({ quantity: 2 });
    assert.equal(updated.status, 200);
    assert.deepEqual(calls[1].args, ['tok', '1', '10', { quantity: 2 }]);

    const deleted = await request(app).delete('/api/v1/lists/1/items/10').set(...auth);
    assert.equal(deleted.status, 204);
});

test('backend validation errors reach the client unchanged', async () => {
    const { app } = setup({ createItem: () => { throw new HttpError(400, 'item_name is required.'); } });
    const res = await request(app).post('/api/v1/lists/1/items').set(...auth).send({});
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'item_name is required.');
});

test('invalid JSON body gives 400', async () => {
    const { app } = setup();
    const res = await request(app).post('/api/v1/lists').set(...auth)
        .set('Content-Type', 'application/json').send('{bad');
    assert.equal(res.status, 400);
});
