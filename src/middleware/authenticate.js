const { HttpError } = require('../httpError');

// Validates the bearer token through the SSO service and sets
// req.user (identity from the token) and req.token (forwarded to downstream services).
function authenticate(ssoClient) {
    return async (req, res, next) => {
        try {
            const [scheme, token] = (req.get('Authorization') || '').split(' ');
            if (scheme !== 'Bearer' || !token) {
                throw new HttpError(401, 'Missing bearer token.');
            }
            req.user = await ssoClient.verify(token);
            req.token = token;
            next();
        } catch (error) {
            next(error);
        }
    };
}

module.exports = { authenticate };
