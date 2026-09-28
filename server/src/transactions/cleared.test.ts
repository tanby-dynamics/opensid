import express from 'express';
import request from 'supertest';
import t from 'tap';
import db from '../db';
import transactionRoutes from './routes';

function resetDatabase() {
    db.exec(`
        DELETE FROM transactions;
        DELETE FROM accounts;
    `);
}

function insertAccount(name: string, reconciliationEnabled: boolean): number {
    return Number(
        db
            .prepare('INSERT INTO accounts (name, reconciliation_enabled) VALUES (?, ?)')
            .run(name, reconciliationEnabled ? 1 : 0).lastInsertRowid,
    );
}

function insertTransaction(accountId: number): number {
    return Number(
        db
            .prepare(
                `INSERT INTO transactions (account_id, description, amount_cents, type, date)
                 VALUES (?, 'Coffee', -500, 'expense', '2026-01-01')`,
            )
            .run(accountId).lastInsertRowid,
    );
}

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/accounts/:accountId/transactions', transactionRoutes);
    return app;
}

t.beforeEach(() => {
    resetDatabase();
});

t.teardown(() => {
    resetDatabase();
});

t.test('PUT /:id/cleared — rejects when reconciliation is disabled for the account', async (t) => {
    const app = makeApp();
    const accountId = insertAccount('Expense tracker', false);
    const txId = insertTransaction(accountId);

    const res = await request(app)
        .put(`/api/accounts/${accountId}/transactions/${txId}/cleared`)
        .send({ cleared: true })
        .expect(403);

    t.match(res.body.error, /disabled/i);
});

t.test('PUT /:id/cleared — succeeds when reconciliation is enabled for the account', async (t) => {
    const app = makeApp();
    const accountId = insertAccount('Checking', true);
    const txId = insertTransaction(accountId);

    const res = await request(app)
        .put(`/api/accounts/${accountId}/transactions/${txId}/cleared`)
        .send({ cleared: true })
        .expect(200);

    t.ok(res.body.cleared_at);
});
