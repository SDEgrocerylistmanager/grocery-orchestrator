const cors = require('cors');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { loadConfig } = require('./config');
const { createSsoClient } = require('./clients/ssoClient');
const { createBackendClient } = require('./clients/backendClient');
const { createListService } = require('./services/listService');
const { authenticate } = require('./middleware/authenticate');
const { errorHandler } = require('./middleware/errorHandler');
const { createApiRouter } = require('./routes/api');

// Dependencies can be replaced (tests inject fake clients).
function createApp({ config = loadConfig(), ssoClient, backendClient } = {}) {
    const sso = ssoClient || createSsoClient({ baseUrl: config.ssoUrl, timeoutMs: config.timeoutMs });
    const backend = backendClient
        || createBackendClient({ baseUrl: config.backendUrl, timeoutMs: config.timeoutMs });
    const listService = createListService({ backend });
    const app = express();

    app.use(rateLimit({
        windowMs: 30 * 1000,
        limit: 120,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        handler: (req, res) => res.status(429).json({ error: 'Too many requests.' }),
    }));
    app.use(cors({
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        optionsSuccessStatus: 200,
    }));
    app.use(express.json());

    app.get('/health', (req, res) => res.json({ status: 'ok' }));
    app.use('/api/v1', authenticate(sso), createApiRouter({ backend, listService }));

    app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));
    app.use(errorHandler);

    return app;
}

module.exports = { createApp };
