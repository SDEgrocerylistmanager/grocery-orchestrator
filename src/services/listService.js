// Compositions over the backend that the frontend needs in a single call.
function createListService({ backend }) {
    return {
        // The list and all its items, read in parallel.
        async getListWithItems(token, listId) {
            const [list, items] = await Promise.all([
                backend.getList(token, listId),
                backend.getAllItems(token, listId),
            ]);
            return { ...list, items };
        },
    };
}

module.exports = { createListService };
