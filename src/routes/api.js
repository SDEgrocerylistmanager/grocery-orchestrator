const express = require('express');
const { createListsRouter } = require('./lists');
const { createMeRouter } = require('./me');

// Routes behind authentication.
function createApiRouter({ backend, categorizer, listService, categorizeService, shareService }) {
    const router = express.Router();

    router.use('/me', createMeRouter({ backend }));
    // Departments for the manual category dropdown
    router.get('/departments', async (req, res) => res.json({ data: await categorizer.departments() }));
    router.use('/lists', createListsRouter({ backend, listService, categorizeService, shareService }));

    return router;
}

module.exports = { createApiRouter };
