import express from 'express';
import request from 'supertest';
import t from 'tap';
import db from '../db';
import * as repo from './repository';
import transactionRoutes from './routes';
import searchRoutes from './searchRoutes';

function resetDatabase() {
    db.exec(`
        DELETE FROM attachments;
        DELETE FROM transactions;
        DELETE FROM accounts;
    `);
}

function insertAccount(name: string): number {
    return Number(db.prepare('INSERT INTO accounts (name) VALUES (?)').run(name).lastInsertRowid);
}

function insertTransaction(args: {
    accountId: number;
    description: string;
    category?: string | null;
    notes?: string | null;
    amount_cents?: number;
    type?: 'income' | 'expense';
    date?: string;
    recurrence?: string | null;
    recurrence_source_id?: number | null;
}): number {
    return Number(
        db
            .prepare(
                `INSERT INTO transactions (account_id, category, description, amount_cents, type, date, notes, recurrence, recurrence_source_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
                args.accountId,
                args.category ?? null,
                args.description,
                args.amount_cents ?? -5000,
                args.type ?? 'expense',
                args.date ?? '2026-05-01',
                args.notes ?? null,
                args.recurrence ?? null,
                args.recurrence_source_id ?? null,
            ).lastInsertRowid,
    );
}

function insertAttachment(transactionId: number, deleted = false): void {
    db.prepare(
        `INSERT INTO attachments (transaction_id, filename, mime_type, size_bytes, data, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(transactionId, 'receipt.png', 'image/png', 100, Buffer.from([0]), deleted ? new Date().toISOString() : null);
}

t.beforeEach(() => {
    resetDatabase();
});

t.teardown(() => {
    resetDatabase();
});

t.test('findByAccount: keyword matches category as well as description and notes', async () => {
    const a = insertAccount('Everyday');
    const tCat = insertTransaction({ accountId: a, description: 'Bunnings', category: 'Hardware', notes: null });
    const tDesc = insertTransaction({ accountId: a, description: 'Hardware store run', category: 'Other', notes: null });
    const tNotes = insertTransaction({ accountId: a, description: 'Misc', category: 'Other', notes: 'a hardware purchase' });
    const tOther = insertTransaction({ accountId: a, description: 'Coffee', category: 'Cafés', notes: null });

    const found = repo.findByAccount(a, { keyword: 'hardware' });
    const ids = found.map((r) => r.id).sort();
    t.same(ids, [tCat, tDesc, tNotes].sort());
    t.notOk(ids.includes(tOther));
});

t.test('findByAccount: hasAttachment=true includes only attached transactions', async () => {
    const a = insertAccount('Everyday');
    const tx1 = insertTransaction({ accountId: a, description: 'A' });
    const tx2 = insertTransaction({ accountId: a, description: 'B' });
    insertAttachment(tx1);

    const found = repo.findByAccount(a, { hasAttachment: true });
    t.equal(found.length, 1);
    t.equal(found[0].id, tx1);

    const inverse = repo.findByAccount(a, { hasAttachment: false });
    t.equal(inverse.length, 1);
    t.equal(inverse[0].id, tx2);
});

t.test('findByAccount: hasAttachment ignores soft-deleted attachments', async () => {
    const a = insertAccount('Everyday');
    const tx = insertTransaction({ accountId: a, description: 'A' });
    insertAttachment(tx, true); // soft-deleted

    const found = repo.findByAccount(a, { hasAttachment: true });
    t.equal(found.length, 0);
});

t.test('findByAccount: recurringOnly matches templates and generated rows', async () => {
    const a = insertAccount('Everyday');
    const template = insertTransaction({ accountId: a, description: 'Rent', recurrence: 'monthly' });
    const generated = insertTransaction({ accountId: a, description: 'Rent (auto)', recurrence_source_id: template });
    insertTransaction({ accountId: a, description: 'One-off' });

    const found = repo.findByAccount(a, { recurringOnly: true });
    const ids = found.map((r) => r.id).sort();
    t.same(ids, [template, generated].sort());
});

t.test('searchAll: aggregates across accounts and includes account_name', async () => {
    const everyday = insertAccount('Everyday');
    const savings = insertAccount('Savings');
    insertTransaction({ accountId: everyday, description: 'Hardware run', category: 'Tools' });
    insertTransaction({ accountId: savings, description: 'Hardware fund deposit', category: 'Misc', type: 'income', amount_cents: 10000 });
    insertTransaction({ accountId: everyday, description: 'Coffee', category: 'Cafés' });

    const found = repo.searchAll({ keyword: 'hardware' });
    t.equal(found.length, 2);
    const byAccount = new Map(found.map((r) => [r.account_name, r] as const));
    t.ok(byAccount.has('Everyday'));
    t.ok(byAccount.has('Savings'));
});

t.test('searchAll: excludes soft-deleted accounts and transactions', async () => {
    const live = insertAccount('Live');
    const deletedAcct = insertAccount('Deleted');
    db.prepare(`UPDATE accounts SET deleted_at = datetime('now') WHERE id = ?`).run(deletedAcct);

    insertTransaction({ accountId: live, description: 'Hardware visible' });
    insertTransaction({ accountId: deletedAcct, description: 'Hardware on deleted account' });
    const liveDeleted = insertTransaction({ accountId: live, description: 'Hardware deleted tx' });
    db.prepare(`UPDATE transactions SET deleted_at = datetime('now') WHERE id = ?`).run(liveDeleted);

    const found = repo.searchAll({ keyword: 'hardware' });
    t.equal(found.length, 1);
    t.equal(found[0].account_name, 'Live');
});

t.test('GET /api/transactions/search parses new filter params', async () => {
    const a = insertAccount('Everyday');
    const withAttach = insertTransaction({ accountId: a, description: 'Bunnings', category: 'Hardware' });
    insertAttachment(withAttach);
    insertTransaction({ accountId: a, description: 'Coffee', category: 'Cafés' });

    const app = express();
    app.use(express.json());
    app.use('/api/transactions/search', searchRoutes);

    const res = await request(app)
        .get('/api/transactions/search')
        .query({ hasAttachment: 'true' })
        .expect(200);

    t.equal(res.body.length, 1);
    t.equal(res.body[0].id, withAttach);
    t.equal(res.body[0].account_name, 'Everyday');
});

t.test('GET /api/transactions/search with recurringOnly and keyword', async () => {
    const a = insertAccount('Everyday');
    const template = insertTransaction({ accountId: a, description: 'Spotify', category: 'Subs', recurrence: 'monthly' });
    insertTransaction({ accountId: a, description: 'Spotify one-off topup' });
    insertTransaction({ accountId: a, description: 'Coffee', recurrence: 'daily' });

    const app = express();
    app.use(express.json());
    app.use('/api/transactions/search', searchRoutes);

    const res = await request(app)
        .get('/api/transactions/search')
        .query({ keyword: 'spotify', recurringOnly: 'true' })
        .expect(200);

    t.equal(res.body.length, 1);
    t.equal(res.body[0].id, template);
});

t.test('GET /api/accounts/:id/transactions accepts new filter params', async () => {
    const a = insertAccount('Everyday');
    const withAttach = insertTransaction({ accountId: a, description: 'Bunnings', category: 'Hardware' });
    insertAttachment(withAttach);
    insertTransaction({ accountId: a, description: 'Coffee' });

    const app = express();
    app.use(express.json());
    app.use('/api/accounts/:accountId/transactions', transactionRoutes);

    const res = await request(app)
        .get(`/api/accounts/${a}/transactions`)
        .query({ hasAttachment: 'true', recurringOnly: 'false' })
        .expect(200);

    t.equal(res.body.transactions.length, 1);
    t.equal(res.body.transactions[0].id, withAttach);
});
