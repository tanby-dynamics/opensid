import express from 'express';
import request from 'supertest';
import t from 'tap';
import db from '../db';
import netWorthRoutes from './routes';

function resetDatabase() {
    db.exec(`
        DELETE FROM attachments;
        DELETE FROM transactions;
        DELETE FROM dashboard_config;
        DELETE FROM accounts;
    `);
}

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/net-worth', netWorthRoutes);
    return app;
}

function insertAccount(name: string, kind: 'asset' | 'liability' = 'asset', excludeFromNetWorth = 0): number {
    return Number(
        db.prepare(`INSERT INTO accounts (name, kind, exclude_from_net_worth) VALUES (?, ?, ?)`)
            .run(name, kind, excludeFromNetWorth).lastInsertRowid,
    );
}

function insertTransaction(accountId: number, amountCents: number, date: string, type: 'income' | 'expense' = 'income') {
    db.prepare(
        `INSERT INTO transactions (account_id, description, category, amount_cents, type, date) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(accountId, 'tx', 'tx', amountCents, type, date);
}

t.beforeEach(() => {
    resetDatabase();
});

t.teardown(() => {
    resetDatabase();
});

t.test('GET / — sums assets minus absolute liabilities', async (t) => {
    const everyday = insertAccount('Everyday', 'asset');
    const savings = insertAccount('Savings', 'asset');
    const visa = insertAccount('Visa', 'liability');

    insertTransaction(everyday, 100000, '2026-01-01');
    insertTransaction(savings, 500000, '2026-01-01');
    insertTransaction(visa, -50000, '2026-01-01');

    const app = makeApp();
    const res = await request(app).get('/api/net-worth?on_date=2026-05-28').expect(200);

    t.equal(res.body.assets_cents, 600000);
    t.equal(res.body.liabilities_cents, 50000);
    t.equal(res.body.total_cents, 550000);
    t.equal(res.body.accounts.length, 3);
});

t.test('GET / — excludes accounts flagged exclude_from_net_worth', async (t) => {
    const everyday = insertAccount('Everyday', 'asset');
    const playMoney = insertAccount('Play money', 'asset', 1);

    insertTransaction(everyday, 100000, '2026-01-01');
    insertTransaction(playMoney, 999999, '2026-01-01');

    const app = makeApp();
    const res = await request(app).get('/api/net-worth?on_date=2026-05-28').expect(200);

    t.equal(res.body.total_cents, 100000);
    t.equal(res.body.accounts.length, 1);
});

t.test('GET / — excludes soft-deleted accounts', async (t) => {
    const everyday = insertAccount('Everyday', 'asset');
    insertTransaction(everyday, 100000, '2026-01-01');
    db.prepare(`UPDATE accounts SET deleted_at = datetime('now') WHERE id = ?`).run(everyday);

    const app = makeApp();
    const res = await request(app).get('/api/net-worth?on_date=2026-05-28').expect(200);

    t.equal(res.body.total_cents, 0);
    t.equal(res.body.accounts.length, 0);
});

t.test('GET / — defaults on_date to today when omitted', async (t) => {
    const app = makeApp();
    const res = await request(app).get('/api/net-worth').expect(200);
    const today = new Date().toISOString().slice(0, 10);
    t.equal(res.body.as_of, today);
});

t.test('GET / — returns 400 for malformed on_date', async () => {
    const app = makeApp();
    await request(app).get('/api/net-worth?on_date=not-a-date').expect(400);
});

t.test('GET /history — walks daily balances across accounts', async (t) => {
    const everyday = insertAccount('Everyday', 'asset');
    const visa = insertAccount('Visa', 'liability');

    insertTransaction(everyday, 10000, '2026-05-01');
    insertTransaction(visa, -2000, '2026-05-03');

    const app = makeApp();
    const res = await request(app).get('/api/net-worth/history?window=all').expect(200);

    t.ok(Array.isArray(res.body));
    const byDate = new Map(res.body.map((p: { date: string; total_cents: number }) => [p.date, p.total_cents]));
    t.equal(byDate.get('2026-05-01'), 10000);
    t.equal(byDate.get('2026-05-02'), 10000);
    t.equal(byDate.get('2026-05-03'), 8000);
});

t.test('GET /history — returns 400 for invalid window', async () => {
    const app = makeApp();
    await request(app).get('/api/net-worth/history?window=bogus').expect(400);
});

t.test('GET /history — transfers between two assets leave total unchanged', async (t) => {
    const a = insertAccount('A', 'asset');
    const b = insertAccount('B', 'asset');
    insertTransaction(a, 100000, '2026-05-01');
    insertTransaction(b, 100000, '2026-05-01');

    // simulate a $100 transfer: -10000 from A, +10000 to B
    insertTransaction(a, -10000, '2026-05-05', 'expense');
    insertTransaction(b, 10000, '2026-05-05', 'income');

    const app = makeApp();
    const before = await request(app).get('/api/net-worth?on_date=2026-05-04').expect(200);
    const after = await request(app).get('/api/net-worth?on_date=2026-05-06').expect(200);

    t.equal(before.body.total_cents, after.body.total_cents);
});
