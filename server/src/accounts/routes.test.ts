import express from 'express';
import request from 'supertest';
import t from 'tap';
import db from '../db';
import accountRoutes from './routes';

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
    app.use('/api/accounts', accountRoutes);
    return app;
}

t.beforeEach(() => {
    resetDatabase();
});

t.teardown(() => {
    resetDatabase();
});

t.test('POST / — defaults kind to asset and exclude_from_net_worth to false', async (t) => {
    const app = makeApp();
    const res = await request(app).post('/api/accounts').send({ name: 'Everyday' }).expect(201);
    t.equal(res.body.kind, 'asset');
    t.equal(res.body.exclude_from_net_worth, 0);
});

t.test('POST / — accepts kind and exclude_from_net_worth', async (t) => {
    const app = makeApp();
    const res = await request(app)
        .post('/api/accounts')
        .send({ name: 'Visa', kind: 'liability', exclude_from_net_worth: true })
        .expect(201);
    t.equal(res.body.kind, 'liability');
    t.equal(res.body.exclude_from_net_worth, 1);
});

t.test('POST / — rejects invalid kind', async () => {
    const app = makeApp();
    await request(app).post('/api/accounts').send({ name: 'Bad', kind: 'nonsense' }).expect(400);
});

t.test('PUT /:id — updates kind and exclude_from_net_worth', async (t) => {
    const app = makeApp();
    const created = await request(app).post('/api/accounts').send({ name: 'Everyday' }).expect(201);

    const res = await request(app)
        .put(`/api/accounts/${created.body.id}`)
        .send({ name: 'Everyday', kind: 'liability', exclude_from_net_worth: true })
        .expect(200);

    t.equal(res.body.kind, 'liability');
    t.equal(res.body.exclude_from_net_worth, 1);
});

t.test('PUT /:id — preserves existing kind/exclude when not provided', async (t) => {
    const app = makeApp();
    const created = await request(app)
        .post('/api/accounts')
        .send({ name: 'Play money', kind: 'asset', exclude_from_net_worth: true })
        .expect(201);

    const res = await request(app)
        .put(`/api/accounts/${created.body.id}`)
        .send({ name: 'Play money renamed' })
        .expect(200);

    t.equal(res.body.kind, 'asset');
    t.equal(res.body.exclude_from_net_worth, 1);
});
