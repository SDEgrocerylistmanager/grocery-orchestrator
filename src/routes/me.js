const express = require('express');
const { HttpError } = require('../httpError');

const CHAT_ID = /^-?\d{1,20}$/;

function createMeRouter({ backend }) {
    const router = express.Router();

    // Identity from the token plus the profile kept by the backend (Telegram link)
    router.get('/', async (req, res) => {
        const profile = await backend.getMe(req.token);
        res.json({ data: { ...req.user, telegram_chat_id: profile.telegram_chat_id ?? null } });
    });

    // Saves the chat id the bot gave to the user
    router.put('/telegram', async (req, res) => {
        const raw = req.body?.chat_id;
        const chatId = typeof raw === 'number' ? String(raw) : raw;
        if (typeof chatId !== 'string' || !CHAT_ID.test(chatId.trim())) {
            throw new HttpError(400, 'chat_id must be the number the bot sent you.');
        }
        await backend.updateMe(req.token, { telegram_chat_id: chatId.trim() });
        res.json({ data: { telegram_chat_id: chatId.trim() } });
    });

    router.delete('/telegram', async (req, res) => {
        await backend.updateMe(req.token, { telegram_chat_id: null });
        res.status(204).end();
    });

    return router;
}

module.exports = { createMeRouter };
