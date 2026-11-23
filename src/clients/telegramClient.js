const { HttpError } = require('../httpError');
const { callJson } = require('./http');

// grocery-telegram-adapter: POST /messages { chat_id, text }.
function createTelegramClient({ baseUrl, timeoutMs, fetchImpl = fetch }) {
    async function sendMessage(chatId, text) {
        const res = await callJson(fetchImpl, `${baseUrl}/messages`, {
            method: 'POST', body: { chat_id: chatId, text }, timeoutMs, serviceName: 'Telegram adapter',
        });
        if (res.ok) return res.json.data;
        // 422: wrong chat id, Start never pressed, or bot blocked. 400: the stored id is malformed.
        if (res.status === 422 || res.status === 400) {
            throw new HttpError(422, 'Telegram chat not reachable: open the bot, press Start and check the chat id.');
        }
        // Keeps the adapter's reason (e.g. "Telegram bot not configured.")
        if (res.status === 503) throw new HttpError(503, res.json?.error || 'Telegram unavailable.');
        throw new HttpError(502, 'Unexpected answer from the Telegram adapter.');
    }

    return { sendMessage };
}

module.exports = { createTelegramClient };
