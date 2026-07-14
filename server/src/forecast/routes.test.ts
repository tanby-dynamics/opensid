import express from 'express';
import request from 'supertest';
import t from 'tap';
import db from '../db';
import forecastRoutes from './routes';

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
    app.use('/api/accounts/:id/forecast', forecastRoutes);
    return app;
}

function insertAccount(name: string): number {
    return Number(db.prepare(`INSERT INTO accounts (name) VALUES (?)`).run(name).lastInsertRowid);
}

t.beforeEach(() => {
    resetDatabase();
});

t.teardown(() => {
    resetDatabase();
});

t.test('GET / — returns 404 for unknown account', async () => {
    const app = makeApp();
    await request(app).get('/api/accounts/9999/forecast').expect(404);
});

t.test('GET / — returns 400 for an invalid days value', async () => {
    const account = insertAccount('Everyday');
    const app = makeApp();
    await request(app).get(`/api/accounts/${account}/forecast?days=45`).expect(400);
});

t.test('GET / — defaults to a 30-day window', async (t) => {
    const account = insertAccount('Everyday');
    const app = makeApp();
    const res = await request(app).get(`/api/accounts/${account}/forecast`).expect(200);
    t.equal(res.body.window_days, 30);
    t.equal(res.body.daily.length, 30);
});

t.test('GET / — accepts include_discretionary and echoes it back', async (t) => {
    const account = insertAccount('Everyday');
    const app = makeApp();
    const res = await request(app)
        .get(`/api/accounts/${account}/forecast?days=14&include_discretionary=true`)
        .expect(200);
    t.equal(res.body.window_days, 14);
    t.equal(res.body.include_discretionary, true);
});
