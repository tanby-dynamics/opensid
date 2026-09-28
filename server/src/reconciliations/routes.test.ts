import express from 'express';
import request from 'supertest';
import t from 'tap';
import db from '../db';
import reconciliationRoutes from './routes';

function resetDatabase() {
    db.exec(`
        DELETE FROM reconciliations;
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

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/accounts/:accountId/reconciliations', reconciliationRoutes);
    return app;
}

t.beforeEach(() => {
    resetDatabase();
});

t.teardown(() => {
    resetDatabase();
});

t.test('POST / — rejects when reconciliation is disabled for the account', async (t) => {
    const app = makeApp();
    const accountId = insertAccount('Expense tracker', false);

    const res = await request(app)
        .post(`/api/accounts/${accountId}/reconciliations`)
        .send({ statement_date: '2026-01-01', statement_balance_cents: 1000 })
        .expect(403);

    t.match(res.body.error, /disabled/i);
});

t.test('POST / — succeeds when reconciliation is enabled for the account', async (t) => {
    const app = makeApp();
    const accountId = insertAccount('Checking', true);

    const res = await request(app)
        .post(`/api/accounts/${accountId}/reconciliations`)
        .send({ statement_date: '2026-01-01', statement_balance_cents: 1000 })
        .expect(201);

    t.equal(res.body.account_id, accountId);
});

t.test('GET / — still returns history for a disabled account (data is preserved, not deleted)', async (t) => {
    const app = makeApp();
    const accountId = insertAccount('Checking', true);

    await request(app)
        .post(`/api/accounts/${accountId}/reconciliations`)
        .send({ statement_date: '2026-01-01', statement_balance_cents: 1000 })
        .expect(201);

    db.prepare('UPDATE accounts SET reconciliation_enabled = 0 WHERE id = ?').run(accountId);

    const res = await request(app).get(`/api/accounts/${accountId}/reconciliations`).expect(200);
    t.equal(res.body.length, 1);
});
