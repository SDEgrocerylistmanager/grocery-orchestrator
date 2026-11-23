const { HttpError } = require('../httpError');
const { callJson } = require('./http');

// Asks grocery-sso-service to validate a bearer token (GET /auth/verify).
// The service returns { sub, preferred_username, email, exp } or 401 / 503.
function createSsoClient({ baseUrl, timeoutMs, fetchImpl = fetch }) {
    async function verify(token) {
        const res = await callJson(fetchImpl, `${baseUrl}/auth/verify`, {
            token, timeoutMs, serviceName: 'Authentication service',
        });

        if (res.status === 401) throw new HttpError(401, 'Invalid or expired token.');
        if (res.status === 503) throw new HttpError(503, 'Authentication service unavailable.');
        if (!res.ok || !res.json?.sub) {
            throw new HttpError(502, 'Unexpected answer from the authentication service.');
        }

        return {
            id: res.json.sub,
            username: res.json.preferred_username ?? null,
            email: res.json.email ?? null,
            exp: res.json.exp,
        };
    }

    return { verify };
}

module.exports = { createSsoClient };
