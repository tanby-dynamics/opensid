import express from 'express';
import request from 'supertest';
import t from 'tap';
import db from '../db';
import dashboardConfigRoutes from './routes';

function resetDatabase() {
    db.exec(`
        DELETE FROM attachments;
        DELETE FROM transactions;
        DELETE FROM budgets;
        DELETE FROM saved_views;
        DELETE FROM dashboard_config;
        DELETE FROM accounts;
    `);
}

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/dashboard-config', dashboardConfigRoutes);
    return app;
}

function insertAccount(name: string): number {
    return Number(db.prepare(`INSERT INTO accounts (name) VALUES (?)`).run(name).lastInsertRowid);
}

function insertTile(accountId: number, tileType: string, timeWindow: string | null = null, showBalance = 0): number {
    const pos = (db.prepare('SELECT COALESCE(MAX(position), 0) AS p FROM dashboard_config').get() as { p: number }).p + 1;
    return Number(
        db.prepare(
            `INSERT INTO dashboard_config (account_id, position, tile_type, time_window, show_balance) VALUES (?, ?, ?, ?, ?)`,
        ).run(accountId, pos, tileType, timeWindow, showBalance).lastInsertRowid,
    );
}

t.beforeEach(() => {
    resetDatabase();
});

t.teardown(() => {
    resetDatabase();
});

// --- PATCH /:id ---

t.test('PATCH /:id — updates all fields and returns updated tile', async (t) => {
    const accountA = insertAccount('Savings');
    const accountB = insertAccount('Checking');
    const tileId = insertTile(accountA, 'transactions');

    const app = makeApp();
    const res = await request(app)
        .patch(`/api/dashboard-config/${tileId}`)
        .send({ account_id: accountB, tile_type: 'balance_over_time', time_window: '3m', show_balance: true })
        .expect(200);

    t.equal(res.body.id, tileId);
    t.equal(res.body.account_id, accountB);
    t.equal(res.body.tile_type, 'balance_over_time');
    t.equal(res.body.time_window, '3m');
    t.equal(res.body.show_balance, true);
});

t.test('PATCH /:id — clears time_window when switching to a type that does not require one', async (t) => {
    const accountId = insertAccount('Savings');
    const tileId = insertTile(accountId, 'balance_over_time', '3m');

    const app = makeApp();
    const res = await request(app)
        .patch(`/api/dashboard-config/${tileId}`)
        .send({ account_id: accountId, tile_type: 'transactions', show_balance: false })
        .expect(200);

    t.equal(res.body.tile_type, 'transactions');
    t.equal(res.body.time_window, null);
});

t.test('PATCH /:id — returns 400 when time_window missing for chart tile type', async () => {
    const accountId = insertAccount('Savings');
    const tileId = insertTile(accountId, 'transactions');

    const app = makeApp();
    await request(app)
        .patch(`/api/dashboard-config/${tileId}`)
        .send({ account_id: accountId, tile_type: 'balance_over_time', show_balance: false })
        .expect(400);
});

t.test('PATCH /:id — returns 400 when time_window is invalid', async () => {
    const accountId = insertAccount('Savings');
    const tileId = insertTile(accountId, 'transactions');

    const app = makeApp();
    await request(app)
        .patch(`/api/dashboard-config/${tileId}`)
        .send({ account_id: accountId, tile_type: 'balance_over_time', time_window: 'bad', show_balance: false })
        .expect(400);
});

t.test('PATCH /:id — returns 404 when tile does not exist', async () => {
    const accountId = insertAccount('Savings');
    const app = makeApp();
    await request(app)
        .patch('/api/dashboard-config/9999')
        .send({ account_id: accountId, tile_type: 'transactions', show_balance: false })
        .expect(404);
});

t.test('PATCH /:id — returns 404 when account does not exist', async () => {
    const accountId = insertAccount('Savings');
    const tileId = insertTile(accountId, 'transactions');

    const app = makeApp();
    await request(app)
        .patch(`/api/dashboard-config/${tileId}`)
        .send({ account_id: 9999, tile_type: 'transactions', show_balance: false })
        .expect(404);
});

t.test('PATCH /:id — returns 400 when show_balance is not a boolean', async () => {
    const accountId = insertAccount('Savings');
    const tileId = insertTile(accountId, 'transactions');

    const app = makeApp();
    await request(app)
        .patch(`/api/dashboard-config/${tileId}`)
        .send({ account_id: accountId, tile_type: 'transactions', show_balance: 'yes' })
        .expect(400);
});

t.test('PATCH /:id — accepts custom weeks time window', async (t) => {
    const accountId = insertAccount('Savings');
    const tileId = insertTile(accountId, 'transactions');

    const app = makeApp();
    const res = await request(app)
        .patch(`/api/dashboard-config/${tileId}`)
        .send({ account_id: accountId, tile_type: 'totals_by_category', time_window: '8w', show_balance: false })
        .expect(200);

    t.equal(res.body.time_window, '8w');
});

// --- GET / ---

t.test('GET / — includes show_balance as boolean in response', async (t) => {
    const accountId = insertAccount('Savings');
    insertTile(accountId, 'transactions', null, 1);

    const app = makeApp();
    const response = await request(app).get('/api/dashboard-config').expect(200);

    t.equal(response.body.items[0].show_balance, true);
    t.type(response.body.items[0].show_balance, 'boolean');
});

t.test('GET / — includes balance_cents for transactions tiles', async (t) => {
    const accountId = insertAccount('Savings');
    db.prepare(
        `INSERT INTO transactions (account_id, description, category, amount_cents, type, date) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(accountId, 'Pay', 'Pay', 100000, 'income', '2026-01-01');
    insertTile(accountId, 'transactions', null, 1);

    const app = makeApp();
    const response = await request(app).get('/api/dashboard-config').expect(200);

    t.equal(response.body.items[0].balance_cents, 100000);
});

t.test('GET / — balance_cents is null for ineligible tile types', async (t) => {
    const accountId = insertAccount('Savings');
    insertTile(accountId, 'totals_by_category', '30d');

    const app = makeApp();
    const response = await request(app).get('/api/dashboard-config').expect(200);

    t.equal(response.body.items[0].balance_cents, null);
});

// --- POST /cross-account ---

t.test('POST /cross-account — adds a net_worth tile with no account_id', async (t) => {
    const app = makeApp();
    const res = await request(app)
        .post('/api/dashboard-config/cross-account')
        .send({ tile_type: 'net_worth' })
        .expect(201);

    t.equal(res.body.account_id, null);
    t.equal(res.body.tile_type, 'net_worth');
});

t.test('POST /cross-account — requires time_window for net_worth_chart', async () => {
    const app = makeApp();
    await request(app)
        .post('/api/dashboard-config/cross-account')
        .send({ tile_type: 'net_worth_chart' })
        .expect(400);
});

t.test('POST /cross-account — rejects per-account tile types', async () => {
    const app = makeApp();
    await request(app)
        .post('/api/dashboard-config/cross-account')
        .send({ tile_type: 'transactions' })
        .expect(400);
});

t.test('PATCH /:id — accepts null account_id for net_worth tile', async (t) => {
    const app = makeApp();
    const created = await request(app)
        .post('/api/dashboard-config/cross-account')
        .send({ tile_type: 'net_worth' })
        .expect(201);

    const res = await request(app)
        .patch(`/api/dashboard-config/${created.body.id}`)
        .send({ account_id: null, tile_type: 'net_worth_chart', time_window: '3m', show_balance: false })
        .expect(200);

    t.equal(res.body.account_id, null);
    t.equal(res.body.tile_type, 'net_worth_chart');
    t.equal(res.body.time_window, '3m');
});
