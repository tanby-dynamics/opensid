import express from 'express';
import request from 'supertest';
import t from 'tap';
import db from '../db';
import dashboardRoutes from './routes';

function resetDatabase() {
    db.exec(`
        DELETE FROM attachments;
        DELETE FROM transactions;
        DELETE FROM dashboard_config;
        DELETE FROM saved_views;
        DELETE FROM accounts;
    `);
}

function insertSavedView(scope: 'account' | 'global', accountId: number | null, filters: Record<string, unknown>): number {
    return Number(
        db.prepare(
            `INSERT INTO saved_views (scope, account_id, name, filters) VALUES (?, ?, ?, ?)`,
        ).run(scope, accountId, 'My view', JSON.stringify(filters)).lastInsertRowid,
    );
}

t.beforeEach(() => {
    resetDatabase();
});

t.teardown(() => {
    resetDatabase();
});

t.test('does not duplicate recent transactions when an account has multiple dashboard tiles', async () => {
    const accountId = Number(
        db.prepare(`INSERT INTO accounts (name) VALUES (?)`).run('Holiday savings').lastInsertRowid,
    );

    db.prepare(
        `INSERT INTO transactions (account_id, category, description, amount_cents, type, date, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(accountId, 'Holiday savings', 'Holiday savings', 20000, 'income', '2026-04-02', null);
    db.prepare(
        `INSERT INTO transactions (account_id, category, description, amount_cents, type, date, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(accountId, 'Holiday savings', 'Holiday savings', 20000, 'income', '2026-04-09', null);

    db.prepare(
        `INSERT INTO dashboard_config (account_id, position, tile_type, time_window)
         VALUES (?, ?, ?, ?)`,
    ).run(accountId, 1, 'transactions', null);
    db.prepare(
        `INSERT INTO dashboard_config (account_id, position, tile_type, time_window)
         VALUES (?, ?, ?, ?)`,
    ).run(accountId, 2, 'balance_over_time', '3m');

    const app = express();
    app.use('/api/dashboard', dashboardRoutes);

    const response = await request(app).get('/api/dashboard').expect(200);

    t.same(response.body, {
        accounts: [
            {
                id: accountId,
                name: 'Holiday savings',
                balance_cents: 40000,
                recent_transactions: [
                    {
                        id: 2,
                        description: 'Holiday savings',
                        amount_cents: 20000,
                        type: 'income',
                        date: '2026-04-09',
                    },
                    {
                        id: 1,
                        description: 'Holiday savings',
                        amount_cents: 20000,
                        type: 'income',
                        date: '2026-04-02',
                    },
                ],
            },
        ],
    });
});

t.test('filters recent_transactions by the transactions tile saved_view_id, but not balance_cents', async (t) => {
    const accountId = Number(
        db.prepare(`INSERT INTO accounts (name) VALUES (?)`).run('Everyday').lastInsertRowid,
    );
    db.prepare(
        `INSERT INTO transactions (account_id, category, description, amount_cents, type, date)
         VALUES (?, 'Groceries', 'Woolies', -5000, 'expense', '2026-04-02')`,
    ).run(accountId);
    db.prepare(
        `INSERT INTO transactions (account_id, category, description, amount_cents, type, date)
         VALUES (?, 'Entertainment', 'Netflix', -1500, 'expense', '2026-04-03')`,
    ).run(accountId);

    const viewId = insertSavedView('account', accountId, { keyword: 'Woolies' });
    db.prepare(
        `INSERT INTO dashboard_config (account_id, position, tile_type, time_window, saved_view_id)
         VALUES (?, 1, 'transactions', NULL, ?)`,
    ).run(accountId, viewId);

    const app = express();
    app.use('/api/dashboard', dashboardRoutes);

    const response = await request(app).get('/api/dashboard').expect(200);

    t.equal(response.body.accounts[0].balance_cents, -6500);
    t.equal(response.body.accounts[0].recent_transactions.length, 1);
    t.equal(response.body.accounts[0].recent_transactions[0].description, 'Woolies');
});

t.test('falls back to unfiltered recent_transactions when the tile saved_view_id has been (soft-)deleted', async (t) => {
    const accountId = Number(
        db.prepare(`INSERT INTO accounts (name) VALUES (?)`).run('Everyday').lastInsertRowid,
    );
    db.prepare(
        `INSERT INTO transactions (account_id, category, description, amount_cents, type, date)
         VALUES (?, 'Groceries', 'Woolies', -5000, 'expense', '2026-04-02')`,
    ).run(accountId);

    const viewId = insertSavedView('account', accountId, { keyword: 'Woolies' });
    db.prepare(`UPDATE saved_views SET deleted_at = datetime('now') WHERE id = ?`).run(viewId);

    db.prepare(
        `INSERT INTO dashboard_config (account_id, position, tile_type, time_window, saved_view_id)
         VALUES (?, 1, 'transactions', NULL, ?)`,
    ).run(accountId, viewId);

    const app = express();
    app.use('/api/dashboard', dashboardRoutes);

    const response = await request(app).get('/api/dashboard').expect(200);

    t.equal(response.body.accounts[0].recent_transactions.length, 1);
});