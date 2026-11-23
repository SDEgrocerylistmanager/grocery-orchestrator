const express = require('express');
const { createListsRouter } = require('./lists');

// Routes behind authentication.
function createApiRouter({ backend, listService }) {
    const router = express.Router();

    router.get('/me', (req, res) => res.json({ data: req.user }));
    router.use('/lists', createListsRouter({ backend, listService }));

    return router;
}

module.exports = { createApiRouter };
