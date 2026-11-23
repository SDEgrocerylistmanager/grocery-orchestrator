const assert = require('node:assert/strict');
const { test } = require('node:test');
const request = require('supertest');
const { createApp } = require('../src/app');
const { HttpError } = require('../src/httpError');

const user = { id: 'sub-1', username: 'anna', email: null, exp: 4102444800 };
const auth = ['Authorization', 'Bearer tok'];
const departments = ['Produce', 'Dairy', 'Household', 'Other'];

const items = [
    { id: 1, item_name: 'milk', category: 'Dairy', quantity: '2.00' },
    { id: 2, item_name: 'bananas', category: null, quantity: '6.00' },
];

function setup({ me = { telegram_chat_id: '555' }, listItems = items, send, summary, getList } = {}) {
    const calls = { summary: [], send: [], updateMe: [] };
    const backend = {
        getMe: async () => ({ id: 'sub-1', ...me }),
        updateMe: async (token, body) => { calls.updateMe.push({ token, body }); return { data: body }; },
        getList: getList || (async () => ({ id: 7, list_name: 'Spesa sabato' })),
        getAllItems: async () => listItems,
    };
    const categorizer = {
        departments: async () => departments,
        summary: summary || (async (list) => {
            calls.summary.push(list);
            return {
                departments: [{ department: 'Dairy', item_count: 1 }, { department: 'Other', item_count: 1 }],
                total_items: list.length,
                text: 'Your grocery list\n\n---- Dairy ----\n- milk x2\n\n---- Other ----\n- bananas x6',
            };
        }),
    };
    const telegram = {
        sendMessage: send || (async (chatId, text) => {
            calls.send.push({ chatId, text });
            return { chat_id: chatId, message_ids: [101] };
        }),
    };
    const app = createApp({
        ssoClient: { verify: async () => user },
        backendClient: backend,
        categorizerClient: categorizer,
        telegramClient: telegram,
    });
    return { app, calls };
}

const share = (app) => request(app).post('/api/v1/lists/7/share/telegram').set(...auth);

test('sends the summary, titled with the list name, to the user chat', async () => {
    const { app, calls } = setup();
    const res = await share(app);

    assert.equal(res.status, 200);
    assert.deepEqual(calls.summary[0], [
        { name: 'milk', quantity: '2.00', category: 'Dairy' },
        { name: 'bananas', quantity: '6.00', category: null },
    ]);
    assert.equal(calls.send[0].chatId, '555');
    assert.equal(calls.send[0].text, 'Spesa sabato\n\n---- Dairy ----\n- milk x2\n\n---- Other ----\n- bananas x6');
    assert.deepEqual(res.body.data, {
        list_id: 7,
        messages_sent: 1,
        total_items: 2,
        departments: [{ department: 'Dairy', item_count: 1 }, { department: 'Other', item_count: 1 }],
    });
});

test('Telegram not linked: 409 and nothing is sent', async () => {
    const { app, calls } = setup({ me: { telegram_chat_id: null } });
    const res = await share(app);
    assert.equal(res.status, 409);
    assert.match(res.body.error, /not linked/);
    assert.equal(calls.send.length, 0);
});

test('empty list: 422 and nothing is sent', async () => {
    const { app, calls } = setup({ listItems: [] });
    const res = await share(app);
    assert.equal(res.status, 422);
    assert.equal(calls.send.length, 0);
});

test('a list of another user is 404', async () => {
    const { app, calls } = setup({ getList: async () => { throw new HttpError(404, 'List not found.'); } });
    assert.equal((await share(app)).status, 404);
    assert.equal(calls.send.length, 0);
});

test('chat not reachable is 422 with the hint', async () => {
    const { app } = setup({ send: async () => { throw new HttpError(422, 'Telegram chat not reachable: open the bot, press Start and check the chat id.'); } });
    const res = await share(app);
    assert.equal(res.status, 422);
    assert.match(res.body.error, /press Start/);
});

test('adapter or categorizer down is 503', async () => {
    const down = async () => { throw new HttpError(503, 'down'); };
    assert.equal((await share(setup({ send: down }).app)).status, 503);
    const { app, calls } = setup({ summary: down });
    assert.equal((await share(app)).status, 503);
    assert.equal(calls.send.length, 0);
});

test('GET /me adds the Telegram link to the identity', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/v1/me').set(...auth);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.id, 'sub-1');
    assert.equal(res.body.data.telegram_chat_id, '555');
});

test('PUT /me/telegram saves the chat id in the backend', async () => {
    const { app, calls } = setup();
    const res = await request(app).put('/api/v1/me/telegram').set(...auth).send({ chat_id: ' 123456789 ' });
    assert.equal(res.status, 200);
    assert.deepEqual(calls.updateMe, [{ token: 'tok', body: { telegram_chat_id: '123456789' } }]);
});

test('PUT /me/telegram rejects anything that is not a chat id', async () => {
    const { app, calls } = setup();
    for (const body of [{}, { chat_id: 'abc' }, { chat_id: '12a' }, { chat_id: 1.5 }]) {
        const res = await request(app).put('/api/v1/me/telegram').set(...auth).send(body);
        assert.equal(res.status, 400, JSON.stringify(body));
    }
    assert.equal(calls.updateMe.length, 0);
});

test('DELETE /me/telegram unlinks', async () => {
    const { app, calls } = setup();
    const res = await request(app).delete('/api/v1/me/telegram').set(...auth);
    assert.equal(res.status, 204);
    assert.deepEqual(calls.updateMe[0].body, { telegram_chat_id: null });
});
