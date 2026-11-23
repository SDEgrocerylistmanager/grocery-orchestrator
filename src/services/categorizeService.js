const { mapSettledLimit } = require('./mapLimit');

const SAVE_CONCURRENCY = 5; // parallel PATCH calls to the backend

// Categorize button: gives a department to the items of a list that have none.
// Items that already have a category (guessed before or set by the user) are never touched.
function createCategorizeService({ backend, categorizer }) {
    async function categorizeList(token, listId) {
        const items = await backend.getAllItems(token, listId);
        const pending = items.filter((item) => item.category === null || item.category === undefined);
        const summary = { categorized: 0, skipped: items.length - pending.length, failed: [] };
        if (pending.length === 0) return { items, summary };

        // Nothing is written if the categorizer fails
        const answers = await categorizer.categorize(
            pending.map((item) => ({ name: item.item_name, quantity: item.quantity })),
        );

        // The backend has no multi-item transaction: save what we can and report the rest.
        // Pressing the button again retries only the items still without a category.
        const work = pending.map((item, index) => ({ item, department: answers[index].department }));
        const saved = await mapSettledLimit(work, SAVE_CONCURRENCY, ({ item, department }) => (
            backend.updateItem(token, listId, String(item.id), { category: department })
        ));

        const updated = new Map();
        saved.forEach((result, index) => {
            const item = pending[index];
            if (result.ok) {
                summary.categorized += 1;
                updated.set(item.id, result.value.data);
            } else {
                summary.failed.push({
                    item_id: item.id,
                    item_name: item.item_name,
                    category: answers[index].department,
                    error: result.error.message,
                });
            }
        });

        return { items: items.map((item) => updated.get(item.id) || item), summary };
    }

    return { categorizeList };
}

module.exports = { createCategorizeService };
