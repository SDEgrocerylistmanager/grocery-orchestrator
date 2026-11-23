const express = require('express');
const { HttpError } = require('../httpError');

// Ids are bigint in the database: reject anything else before calling the backend.
function parseId(value, name) {
    if (!/^[1-9]\d{0,18}$/.test(value)) {
        throw new HttpError(400, `${name} must be a positive integer.`);
    }
    return value;
}

function pageQuery(query) {
    const page = {};
    if (query.limit !== undefined) page.limit = String(query.limit);
    if (query.offset !== undefined) page.offset = String(query.offset);
    return page;
}

// Request bodies are validated by the backend, the single owner of the rules.
function createListsRouter({ backend, listService, categorizeService, shareService }) {
    const router = express.Router();

    router.get('/', async (req, res) => {
        res.json(await backend.listLists(req.token, pageQuery(req.query)));
    });

    router.post('/', async (req, res) => {
        const result = await backend.createList(req.token, req.body ?? {});
        res.status(201).location(`/api/v1/lists/${result.data.id}`).json(result);
    });

    router.get('/:listId', async (req, res) => {
        const listId = parseId(req.params.listId, 'listId');
        res.json({ data: await listService.getListWithItems(req.token, listId) });
    });

    router.patch('/:listId', async (req, res) => {
        const listId = parseId(req.params.listId, 'listId');
        res.json(await backend.updateList(req.token, listId, req.body ?? {}));
    });

    router.delete('/:listId', async (req, res) => {
        await backend.deleteList(req.token, parseId(req.params.listId, 'listId'));
        res.status(204).end();
    });

    // Categorize button: departments for the items that have no category yet
    router.post('/:listId/categorize', async (req, res) => {
        const listId = parseId(req.params.listId, 'listId');
        res.json({ data: await categorizeService.categorizeList(req.token, listId) });
    });

    // Share on Telegram: the list grouped by department, sent to the user's chat
    router.post('/:listId/share/telegram', async (req, res) => {
        const listId = parseId(req.params.listId, 'listId');
        res.json({ data: await shareService.shareList(req.token, listId) });
    });

    router.post('/:listId/items', async (req, res) => {
        const listId = parseId(req.params.listId, 'listId');
        const result = await backend.createItem(req.token, listId, req.body ?? {});
        res.status(201).location(`/api/v1/lists/${listId}/items/${result.data.id}`).json(result);
    });

    router.patch('/:listId/items/:itemId', async (req, res) => {
        const listId = parseId(req.params.listId, 'listId');
        const itemId = parseId(req.params.itemId, 'itemId');
        res.json(await backend.updateItem(req.token, listId, itemId, req.body ?? {}));
    });

    router.delete('/:listId/items/:itemId', async (req, res) => {
        const listId = parseId(req.params.listId, 'listId');
        const itemId = parseId(req.params.itemId, 'itemId');
        await backend.deleteItem(req.token, listId, itemId);
        res.status(204).end();
    });

    return router;
}

module.exports = { createListsRouter };
