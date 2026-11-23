// Settings read from environment variables. Downstream URLs have no trailing slash.
function trimSlash(url) {
    return url.replace(/\/+$/, '');
}

function loadConfig(env = process.env) {
    return {
        port: Number(env.PORT || 8004),
        timeoutMs: Number(env.REQUEST_TIMEOUT_MS || 5000),
        ssoUrl: trimSlash(env.SSO_URL || 'http://localhost:8002'),
        backendUrl: trimSlash(env.BACKEND_URL || 'http://localhost:8080'),
        categorizerUrl: trimSlash(env.CATEGORIZER_URL || 'http://localhost:8003'),
    };
}

module.exports = { loadConfig };
