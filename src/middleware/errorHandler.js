const { HttpError } = require('../httpError');

// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
    if (error instanceof HttpError) {
        return res.status(error.status).json({ error: error.message });
    }
    if (error.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Invalid JSON body.' });
    }
    console.error(error);
    return res.status(500).json({ error: 'Internal server error.' });
}

module.exports = { errorHandler };
