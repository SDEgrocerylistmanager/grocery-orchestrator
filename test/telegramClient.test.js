const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createTelegramClient } = require('../src/clients/telegramClient');

function client(fetchImpl) {
    return createTelegramClient({ baseUrl: 'http://tg', timeoutMs: 100, fetchImpl });
}
const answer = (status, body) => async () => new Response(JSON.stringify(body), { status });

test('sends chat_id and text to the adapter', async () => {
    let call;
    const fetchImpl = async (url, options) => {
        call = { url, method: options.method, body: JSON.parse(options.body) };
        return new Response(JSON.stringify({ data: { chat_id: '5', message_ids: [1, 2] } }), { status: 201 });
    };
    const result = await client(fetchImpl).sendMessage('5', 'hello');
    assert.deepEqual(call, { url: 'http://tg/messages', method: 'POST', body: { chat_id: '5', text: 'hello' } });
    assert.deepEqual(result.message_ids, [1, 2]);
});

test('adapter errors', async () => {
    const cases = [[422, 422], [400, 422], [503, 503], [500, 502]];
    for (const [given, expected] of cases) {
        await assert.rejects(client(answer(given, { error: 'x' })).sendMessage('5', 't'), { status: expected }, String(given));
    }
    await assert.rejects(client(async () => { throw new Error('down'); }).sendMessage('5', 't'), { status: 503 });
    await assert.rejects(
        client(answer(503, { error: 'Telegram bot not configured.' })).sendMessage('5', 't'),
        { status: 503, message: 'Telegram bot not configured.' },
    );
});
