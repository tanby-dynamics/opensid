import express from 'express';
import request from 'supertest';
import t from 'tap';
import db from '../db';
import chartRoutes from './routes';

function resetDatabase() {
    db.exec(`
        DELETE FROM attachments;
        DELETE FROM transaction_tags;
        DELETE FROM transactions;
        DELETE FROM saved_views;
        DELETE FROM accounts;
    `);
}

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/accounts/:id/chart', chartRoutes);
    return app;
}

function insertAccount(name: string): number {
    return Number(db.prepare(`INSERT INTO accounts (name) VALUES (?)`).run(name).lastInsertRowid);
}

function insertTransaction(accountId: number, description: string, category: string, amountCents: number): void {
    db.prepare(
        `INSERT INTO transactions (account_id, category, description, amount_cents, type, date)
         VALUES (?, ?, ?, ?, 'expense', '2026-01-15')`,
    ).run(accountId, category, description, amountCents);
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

t.test('GET /categories — applies the filters from saved_view_id when given', async (t) => {
    const accountId = insertAccount('Everyday');
    insertTransaction(accountId, 'Woolies', 'Groceries', -5000);
    insertTransaction(accountId, 'Netflix', 'Entertainment', -1500);
    const viewId = insertSavedView('account', accountId, { keyword: 'Woolies' });

    const app = makeApp();
    const res = await request(app)
        .get(`/api/accounts/${accountId}/chart/categories`)
        .query({ window: 'all', saved_view_id: viewId })
        .expect(200);

    t.same(res.body, [{ category: 'Groceries', total_cents: 5000 }]);
});

t.test('GET /categories — falls back to unfiltered when saved_view_id belongs to a different account', async (t) => {
    const accountA = insertAccount('Everyday');
    const accountB = insertAccount('Savings');
    insertTransaction(accountA, 'Woolies', 'Groceries', -5000);
    insertTransaction(accountA, 'Netflix', 'Entertainment', -1500);
    const viewIdOnB = insertSavedView('account', accountB, { keyword: 'Woolies' });

    const app = makeApp();
    const res = await request(app)
        .get(`/api/accounts/${accountA}/chart/categories`)
        .query({ window: 'all', saved_view_id: viewIdOnB })
        .expect(200);

    t.equal(res.body.length, 2);
});

t.test('GET /categories — falls back to unfiltered when saved_view_id does not exist', async (t) => {
    const accountId = insertAccount('Everyday');
    insertTransaction(accountId, 'Woolies', 'Groceries', -5000);
    insertTransaction(accountId, 'Netflix', 'Entertainment', -1500);

    const app = makeApp();
    const res = await request(app)
        .get(`/api/accounts/${accountId}/chart/categories`)
        .query({ window: 'all', saved_view_id: 9999 })
        .expect(200);

    t.equal(res.body.length, 2);
});
