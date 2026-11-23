const { HttpError } = require('../httpError');
const { callJson } = require('./http');

// The only place that knows the backend API (db-backend for now, /api/v1).
// When the real Grocery Backend is ready, only this file should change.
const PAGE_SIZE = 100; // maximum page size accepted by the backend

function createBackendClient({ baseUrl, timeoutMs, fetchImpl = fetch }) {
    async function call(method, path, { token, body, query } = {}) {
        const search = query ? `?${new URLSearchParams(query)}` : '';
        const res = await callJson(fetchImpl, `${baseUrl}/api/v1${path}${search}`, {
            method, token, body, timeoutMs, serviceName: 'Backend',
        });

        if (res.ok) return res.json;
        // Client errors of the backend are meaningful to the user: pass them through.
        if ([400, 404, 409].includes(res.status)) {
            throw new HttpError(res.status, res.json?.error || 'Request rejected by the backend.');
        }
        // The SSO accepted the token but the backend did not: configuration problem.
        if (res.status === 401 || res.status === 403) {
            throw new HttpError(502, 'The backend rejected the credentials.');
        }
        if (res.status === 503) throw new HttpError(503, 'Backend unavailable.');
        throw new HttpError(502, 'Unexpected answer from the backend.');
    }

    // Reads every page of a paginated collection.
    async function readAll(path, token) {
        const all = [];
        for (let offset = 0; ; offset += PAGE_SIZE) {
            const page = await call('GET', path, { token, query: { limit: PAGE_SIZE, offset } });
            all.push(...page.data);
            if (page.data.length < PAGE_SIZE) return all;
        }
    }

    return {
        getMe: async (token) => (await call('GET', '/auth/me', { token })).data,
        updateMe: (token, body) => call('PATCH', '/auth/me', { token, body }),

        listLists: (token, query) => call('GET', '/lists', { token, query }),
        createList: (token, body) => call('POST', '/lists', { token, body }),
        getList: async (token, listId) => (await call('GET', `/lists/${listId}`, { token })).data,
        updateList: (token, listId, body) => call('PATCH', `/lists/${listId}`, { token, body }),
        deleteList: (token, listId) => call('DELETE', `/lists/${listId}`, { token }),

        getAllItems: (token, listId) => readAll(`/lists/${listId}/items`, token),
        createItem: (token, listId, body) => call('POST', `/lists/${listId}/items`, { token, body }),
        updateItem: (token, listId, itemId, body) => call('PATCH', `/lists/${listId}/items/${itemId}`, { token, body }),
        deleteItem: (token, listId, itemId) => call('DELETE', `/lists/${listId}/items/${itemId}`, { token }),
    };
}

module.exports = { createBackendClient, PAGE_SIZE };
