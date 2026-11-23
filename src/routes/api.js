const express = require('express');
const { createListsRouter } = require('./lists');

// Routes behind authentication.
function createApiRouter({ backend, categorizer, listService, categorizeService }) {
    const router = express.Router();

    router.get('/me', (req, res) => res.json({ data: req.user }));
    // Departments for the manual category dropdown
    router.get('/departments', async (req, res) => res.json({ data: await categorizer.departments() }));
    router.use('/lists', createListsRouter({ backend, listService, categorizeService }));

    return router;
}

module.exports = { createApiRouter };
