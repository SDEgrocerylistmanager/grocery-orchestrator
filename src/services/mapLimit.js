// Runs fn on every value with at most `limit` calls in flight; keeps the order.
// Each result is { ok: true, value } or { ok: false, error }: one failure does not stop the others.
async function mapSettledLimit(values, limit, fn) {
    const results = new Array(values.length);
    let next = 0;
    async function worker() {
        while (next < values.length) {
            const index = next++;
            try {
                results[index] = { ok: true, value: await fn(values[index]) };
            } catch (error) {
                results[index] = { ok: false, error };
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
    return results;
}

module.exports = { mapSettledLimit };
