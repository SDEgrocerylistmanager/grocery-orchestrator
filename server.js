require('dotenv').config();

const { createApp } = require('./src/app');
const { loadConfig } = require('./src/config');

const config = loadConfig();
const app = createApp({ config });
const server = app.listen(config.port, () => {
    console.log(`Orchestrator listening on port ${config.port}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
