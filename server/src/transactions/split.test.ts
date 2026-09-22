import express from 'express';
import request from 'supertest';
import t from 'tap';
import db from '../db';
import * as repo from './repository';
import transactionRoutes from './routes';
import { getCategoryTotals } from '../chart/repository';
import { getBudgetProgress, createBudget } from '../budgets/repository';
import { generateDueOccurrences } from '../recurrence/service';

function resetDatabase() {
    db.exec(`
        DELETE FROM attachments;
        DELETE FROM transaction_tags;
        DELETE FROM transactions;
        DELETE FROM budgets;
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
    amount_cents?: number;
    type?: 'income' | 'expense' | 'transfer';
    date?: string;
    recurrence?: string | null;
}): number {
    return Number(
        db.prepare(
            `INSERT INTO transactions (account_id, category, description, amount_cents, type, date, recurrence)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
            args.accountId,
            args.category ?? 'Groceries',
            args.description,
            args.amount_cents ?? -20000,
            args.type ?? 'expense',
            args.date ?? '2026-05-01',
            args.recurrence ?? null,
        ).lastInsertRowid,
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

// --- repository ---

t.test('applySplits sets parent category to (split) and creates children summing to the parent amount', (t) => {
    const account = insertAccount('Everyday');
    const parentId = insertTransaction({ accountId: account, description: 'Supermarket', amount_cents: -20000 });

    const children = repo.applySplits(parentId, [
        { amount_cents: -15000, category: 'Groceries', notes: null },
        { amount_cents: -5000, category: 'Household', notes: null },
    ]);

    const parent = repo.findById(parentId)!;
    t.equal(parent.category, '(split)');
    t.equal(parent.split_count, 2);
    t.equal(children.length, 2);
    t.equal(children.reduce((s, c) => s + c.amount_cents, 0), -20000);
    t.end();
});

t.test('unsplit soft-deletes children and restores category to (uncategorised)', (t) => {
    const account = insertAccount('Everyday');
    const parentId = insertTransaction({ accountId: account, description: 'Supermarket', amount_cents: -20000 });
    repo.applySplits(parentId, [
        { amount_cents: -15000, category: 'Groceries', notes: null },
        { amount_cents: -5000, category: 'Household', notes: null },
    ]);

    const restored = repo.unsplit(parentId)!;
    t.equal(restored.category, '(uncategorised)');
    t.equal(restored.split_count, 0);
    t.equal(repo.findChildren(parentId).length, 0);
    t.end();
});

t.test('findByAccount excludes split children from the top-level list', (t) => {
    const account = insertAccount('Everyday');
    const parentId = insertTransaction({ accountId: account, description: 'Supermarket', amount_cents: -20000 });
    repo.applySplits(parentId, [
        { amount_cents: -15000, category: 'Groceries', notes: null },
        { amount_cents: -5000, category: 'Household', notes: null },
    ]);

    const list = repo.findByAccount(account);
    t.equal(list.length, 1);
    t.equal(list[0].id, parentId);
    t.equal(list[0].split_count, 2);
    t.end();
});

// --- routes: POST /:id/split ---

t.test('POST /:id/split validates minimum of two parts', async () => {
    const account = insertAccount('Everyday');
    const parentId = insertTransaction({ accountId: account, amount_cents: -20000, description: 'Supermarket' });
    const app = makeApp();
    await request(app)
        .post(`/api/accounts/${account}/transactions/${parentId}/split`)
        .send({ splits: [{ amount: 200, category: 'Groceries' }] })
        .expect(400);
});

t.test('POST /:id/split rejects a sum mismatch with a descriptive error', async (t) => {
    const account = insertAccount('Everyday');
    const parentId = insertTransaction({ accountId: account, amount_cents: -20000, description: 'Supermarket' });
    const app = makeApp();
    const res = await request(app)
        .post(`/api/accounts/${account}/transactions/${parentId}/split`)
        .send({ splits: [{ amount: 100, category: 'Groceries' }, { amount: 90, category: 'Household' }] })
        .expect(400);
    t.match(res.body.error, /Splits must sum to \$200\.00 \(off by \$10\.00\)/);
});

t.test('POST /:id/split rejects a zero or negative amount', async () => {
    const account = insertAccount('Everyday');
    const parentId = insertTransaction({ accountId: account, amount_cents: -20000, description: 'Supermarket' });
    const app = makeApp();
    await request(app)
        .post(`/api/accounts/${account}/transactions/${parentId}/split`)
        .send({ splits: [{ amount: 200, category: 'Groceries' }, { amount: 0, category: 'Household' }] })
        .expect(400);
});

t.test('POST /:id/split rejects splitting a transaction that is already a split child', async (t) => {
    const account = insertAccount('Everyday');
    const parentId = insertTransaction({ accountId: account, amount_cents: -20000, description: 'Supermarket' });
    const children = repo.applySplits(parentId, [
        { amount_cents: -15000, category: 'Groceries', notes: null },
        { amount_cents: -5000, category: 'Household', notes: null },
    ]);

    const app = makeApp();
    const res = await request(app)
        .post(`/api/accounts/${account}/transactions/${children[0].id}/split`)
        .send({ splits: [{ amount: 100, category: 'A' }, { amount: 50, category: 'B' }] })
        .expect(409);
    t.match(res.body.error, /already a split/);
});

t.test('POST /:id/split rejects splitting a transfer', async () => {
    const account = insertAccount('Everyday');
    const parentId = insertTransaction({ accountId: account, amount_cents: 20000, description: 'Transfer in', type: 'transfer' });
    const app = makeApp();
    await request(app)
        .post(`/api/accounts/${account}/transactions/${parentId}/split`)
        .send({ splits: [{ amount: 100, category: 'A' }, { amount: 100, category: 'B' }] })
        .expect(409);
});

t.test('POST /:id/split succeeds and returns parent + children', async (t) => {
    const account = insertAccount('Everyday');
    const parentId = insertTransaction({ accountId: account, amount_cents: -20000, description: 'Supermarket' });
    const app = makeApp();
    const res = await request(app)
        .post(`/api/accounts/${account}/transactions/${parentId}/split`)
        .send({ splits: [{ amount: 150, category: 'Groceries' }, { amount: 50, category: 'Household' }] })
        .expect(200);

    t.equal(res.body.parent.category, '(split)');
    t.equal(res.body.children.length, 2);
    t.end();
});

// --- routes: PUT /:id/split (replace) ---

t.test('PUT /:id/split replaces the existing children set', async (t) => {
    const account = insertAccount('Everyday');
    const parentId = insertTransaction({ accountId: account, amount_cents: -20000, description: 'Supermarket' });
    repo.applySplits(parentId, [
        { amount_cents: -15000, category: 'Groceries', notes: null },
        { amount_cents: -5000, category: 'Household', notes: null },
    ]);

    const app = makeApp();
    const res = await request(app)
        .put(`/api/accounts/${account}/transactions/${parentId}/split`)
        .send({ splits: [{ amount: 120, category: 'Groceries' }, { amount: 80, category: 'Petrol' }] })
        .expect(200);

    const categories = (res.body.children as { category: string }[]).map((c) => c.category).sort();
    t.same(categories, ['Groceries', 'Petrol']);
    t.equal(repo.findChildren(parentId).length, 2);
    t.end();
});

// --- routes: DELETE /:id/split (unsplit) ---

t.test('DELETE /:id/split unsplits and returns the plain parent', async (t) => {
    const account = insertAccount('Everyday');
    const parentId = insertTransaction({ accountId: account, amount_cents: -20000, description: 'Supermarket' });
    repo.applySplits(parentId, [
        { amount_cents: -15000, category: 'Groceries', notes: null },
        { amount_cents: -5000, category: 'Household', notes: null },
    ]);

    const app = makeApp();
    const res = await request(app)
        .delete(`/api/accounts/${account}/transactions/${parentId}/split`)
        .expect(200);

    t.equal(res.body.category, '(uncategorised)');
    t.equal(res.body.split_count, 0);
    t.end();
});

t.test('DELETE /:id/split 404s when there is nothing to unsplit', async () => {
    const account = insertAccount('Everyday');
    const parentId = insertTransaction({ accountId: account, amount_cents: -20000, description: 'Supermarket' });
    const app = makeApp();
    await request(app)
        .delete(`/api/accounts/${account}/transactions/${parentId}/split`)
        .expect(404);
});

// --- routes: GET /:id/split ---

t.test('GET /:id/split lists the children', async (t) => {
    const account = insertAccount('Everyday');
    const parentId = insertTransaction({ accountId: account, amount_cents: -20000, description: 'Supermarket' });
    repo.applySplits(parentId, [
        { amount_cents: -15000, category: 'Groceries', notes: null },
        { amount_cents: -5000, category: 'Household', notes: null },
    ]);

    const app = makeApp();
    const res = await request(app).get(`/api/accounts/${account}/transactions/${parentId}/split`).expect(200);
    t.equal(res.body.children.length, 2);
    t.end();
});

// --- routes: POST / accepts splits atomically ---

t.test('POST / creates the parent and children in one call', async (t) => {
    const account = insertAccount('Everyday');
    const app = makeApp();
    const res = await request(app)
        .post(`/api/accounts/${account}/transactions`)
        .send({
            category: 'Shopping',
            amount: 200,
            type: 'expense',
            date: '2026-05-01',
            splits: [{ amount: 150, category: 'Groceries' }, { amount: 50, category: 'Household' }],
        })
        .expect(201);

    t.equal(res.body.category, '(split)');
    t.equal(res.body.split_count, 2);
    t.end();
});

t.test('POST / rolls back to a 400 without creating a transaction when the split sum is wrong', async (t) => {
    const account = insertAccount('Everyday');
    const app = makeApp();
    await request(app)
        .post(`/api/accounts/${account}/transactions`)
        .send({
            category: 'Shopping',
            amount: 200,
            type: 'expense',
            date: '2026-05-01',
            splits: [{ amount: 150, category: 'Groceries' }, { amount: 10, category: 'Household' }],
        })
        .expect(400);

    t.equal(repo.findByAccount(account).length, 0);
    t.end();
});

// --- reporting ---

t.test('category chart reads children, not the (split) parent category', (t) => {
    const account = insertAccount('Everyday');
    const parentId = insertTransaction({ accountId: account, amount_cents: -20000, description: 'Supermarket', date: '2026-05-15' });
    repo.applySplits(parentId, [
        { amount_cents: -15000, category: 'Groceries', notes: null },
        { amount_cents: -5000, category: 'Household', notes: null },
    ]);

    const totals = getCategoryTotals(account, null);
    const byCategory = new Map(totals.map((r) => [r.category, r.total_cents]));
    t.equal(byCategory.get('Groceries'), 15000);
    t.equal(byCategory.get('Household'), 5000);
    t.notOk(byCategory.has('(split)'));
    t.end();
});

t.test('budget progress counts the split child, not the parent', (t) => {
    const account = insertAccount('Everyday');
    createBudget(account, { category: 'Groceries', amount_cents: 30000, period: 'monthly', warning_threshold: 80, danger_threshold: 100 });

    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const parentId = insertTransaction({ accountId: account, amount_cents: -20000, description: 'Supermarket', date: dateStr });
    repo.applySplits(parentId, [
        { amount_cents: -15000, category: 'Groceries', notes: null },
        { amount_cents: -5000, category: 'Household', notes: null },
    ]);

    const progress = getBudgetProgress(account);
    t.equal(progress[0].spent_cents, 15000);
    t.end();
});

t.test('account balance counts the parent once, not parent + children', (t) => {
    const account = insertAccount('Everyday');
    const parentId = insertTransaction({ accountId: account, amount_cents: -20000, description: 'Supermarket' });
    repo.applySplits(parentId, [
        { amount_cents: -15000, category: 'Groceries', notes: null },
        { amount_cents: -5000, category: 'Household', notes: null },
    ]);

    t.equal(repo.getBalance(account), -20000);
    t.end();
});

// --- recurrence ---

t.test('generateDueOccurrences replicates split children onto the new occurrence', (t) => {
    const account = insertAccount('Everyday');
    // Template dated yesterday with daily recurrence, so a due occurrence exists for "today".
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    const templateId = insertTransaction({ accountId: account, amount_cents: -20000, description: 'Supermarket', date: yStr, recurrence: 'daily' });
    repo.applySplits(templateId, [
        { amount_cents: -15000, category: 'Groceries', notes: null },
        { amount_cents: -5000, category: 'Household', notes: null },
    ]);

    generateDueOccurrences();

    const occurrence = db.prepare(`SELECT id FROM transactions WHERE recurrence_source_id = ?`).get(templateId) as { id: number } | undefined;
    t.ok(occurrence);
    const children = repo.findChildren(occurrence!.id);
    t.equal(children.length, 2);
    t.equal(children.reduce((s, c) => s + c.amount_cents, 0), -20000);
    t.end();
});
