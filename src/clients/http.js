const { HttpError } = require('../httpError');

// One JSON call to a downstream service. Network errors and timeouts become 503;
// the caller decides what each HTTP status means.
async function callJson(fetchImpl, url, { method = 'GET', token, body, timeoutMs, serviceName }) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response;
    try {
        response = await fetchImpl(url, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(timeoutMs),
        });
    } catch {
        throw new HttpError(503, `${serviceName} unavailable.`);
    }

    const text = await response.text();
    let json = null;
    if (text) {
        try {
            json = JSON.parse(text);
        } catch {
            json = null;
        }
    }
    return { status: response.status, ok: response.ok, json };
}

module.exports = { callJson };
