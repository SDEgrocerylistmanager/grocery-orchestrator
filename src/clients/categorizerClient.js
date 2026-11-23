const { HttpError } = require('../httpError');
const { callJson } = require('./http');

// grocery-categorizer: POST /categorize, GET /departments.
const BATCH_SIZE = 200; // maximum items per /categorize request
const MAX_NAME = 200; // maximum name length accepted by the categorizer

function createCategorizerClient({ baseUrl, timeoutMs, fetchImpl = fetch }) {
    async function call(method, path, body) {
        const res = await callJson(fetchImpl, `${baseUrl}${path}`, {
            method, body, timeoutMs, serviceName: 'Categorizer',
        });
        if (res.ok) return res.json;
        if (res.status === 503) throw new HttpError(503, 'Categorizer unavailable.');
        throw new HttpError(502, 'Unexpected answer from the categorizer.');
    }

    // items: [{ name, quantity }] -> [{ name, quantity, department, source }], same order.
    async function categorize(items) {
        const results = [];
        for (let start = 0; start < items.length; start += BATCH_SIZE) {
            const batch = items.slice(start, start + BATCH_SIZE).map((item) => ({
                // Truncated only for classification; the stored name is unchanged
                name: item.name.slice(0, MAX_NAME),
                // PostgreSQL numeric columns arrive as strings ("1.00")
                quantity: Number(item.quantity ?? 1),
            }));
            const answer = await call('POST', '/categorize', { items: batch });
            // Answers are matched to items by position, so the count must match
            if (!Array.isArray(answer?.items) || answer.items.length !== batch.length) {
                throw new HttpError(502, 'Unexpected answer from the categorizer.');
            }
            results.push(...answer.items);
        }
        return results;
    }

    // The 8 departments never change while the categorizer runs: read them once.
    let departmentsCache = null;
    async function departments() {
        if (!departmentsCache) departmentsCache = await call('GET', '/departments');
        return departmentsCache;
    }

    // items: [{ name, quantity, category }] -> { departments, total_items, text }.
    // Pure formatting by the saved category. The categorizer rejects the whole request for a
    // category that is not one of its departments, so those are sent as null (they go to Other).
    async function summary(items) {
        const known = new Set(await departments());
        return call('POST', '/summary', {
            items: items.map((item) => ({
                name: item.name.slice(0, MAX_NAME),
                quantity: Number(item.quantity ?? 1),
                category: known.has(item.category) ? item.category : null,
            })),
        });
    }

    return { categorize, departments, summary };
}

module.exports = { createCategorizerClient, BATCH_SIZE, MAX_NAME };
