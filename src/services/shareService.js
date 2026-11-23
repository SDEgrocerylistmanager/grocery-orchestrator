const { HttpError } = require('../httpError');

const TITLE = 'Your grocery list'; // first line of the categorizer summary

// Share on Telegram: SSO (done by the middleware), backend, categorizer, Telegram adapter.
function createShareService({ backend, categorizer, telegram }) {
    async function shareList(token, listId) {
        // Independent reads in parallel; departments are cached after the first call
        const [me, list, items] = await Promise.all([
            backend.getMe(token),
            backend.getList(token, listId),
            backend.getAllItems(token, listId),
            categorizer.departments(),
        ]);

        if (!me.telegram_chat_id) {
            throw new HttpError(409, 'Telegram is not linked: send /start to the bot and save your chat id.');
        }
        if (items.length === 0) {
            throw new HttpError(422, 'The list is empty: nothing to share.');
        }

        const summary = await categorizer.summary(
            items.map((item) => ({ name: item.item_name, quantity: item.quantity, category: item.category })),
        );
        // The list name replaces the generic title of the summary
        const text = summary.text.startsWith(TITLE)
            ? `${list.list_name}${summary.text.slice(TITLE.length)}`
            : `${list.list_name}\n\n${summary.text}`;

        const sent = await telegram.sendMessage(me.telegram_chat_id, text);

        return {
            list_id: list.id,
            messages_sent: sent.message_ids.length,
            total_items: summary.total_items,
            departments: summary.departments.map((d) => ({ department: d.department, item_count: d.item_count })),
        };
    }

    return { shareList };
}

module.exports = { createShareService };
