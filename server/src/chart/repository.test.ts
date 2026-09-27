import t from 'tap';
import db from '../db';
import { getBalanceOverTime, getIncomeVsExpenseByMonth, getCategoryTotals } from './repository';

function resetDatabase() {
    db.exec(`
        DELETE FROM attachments;
        DELETE FROM transaction_tags;
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
    amount_cents?: number;
    type?: 'income' | 'expense' | 'transfer';
    date?: string;
}): number {
    return Number(
        db.prepare(
            `INSERT INTO transactions (account_id, category, description, amount_cents, type, date)
             VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(
            args.accountId,
            args.category ?? 'Groceries',
            args.description,
            args.amount_cents ?? -1000,
            args.type ?? 'expense',
            args.date ?? '2026-01-15',
        ).lastInsertRowid,
    );
}

t.beforeEach(() => {
    resetDatabase();
});

t.teardown(() => {
    resetDatabase();
});

t.test('getCategoryTotals — only includes transactions matching the given filters', async (t) => {
    const accountId = insertAccount('Everyday');
    insertTransaction({ accountId, description: 'Woolies', category: 'Groceries', amount_cents: -5000 });
    insertTransaction({ accountId, description: 'Netflix', category: 'Entertainment', amount_cents: -1500 });

    const unfiltered = getCategoryTotals(accountId, null);
    t.equal(unfiltered.length, 2);

    const filtered = getCategoryTotals(accountId, null, { keyword: 'Woolies' });
    t.same(filtered, [{ category: 'Groceries', total_cents: 5000 }]);
});

t.test('getIncomeVsExpenseByMonth — filters respected alongside the type != transfer rule', async (t) => {
    const accountId = insertAccount('Everyday');
    insertTransaction({ accountId, description: 'Salary', type: 'income', amount_cents: 200000, date: '2026-02-01' });
    insertTransaction({ accountId, description: 'Rent', type: 'expense', amount_cents: -150000, date: '2026-02-05' });

    const filtered = getIncomeVsExpenseByMonth(accountId, '2026-02-01', { type: 'income' });
    const feb = filtered.find((p) => p.month === '2026-02');
    t.ok(feb);
    t.equal(feb!.income_cents, 200000);
    t.equal(feb!.expense_cents, 0);
});

t.test('getBalanceOverTime — filters narrow both the starting balance and the running total', async (t) => {
    const accountId = insertAccount('Everyday');
    insertTransaction({ accountId, description: 'Old groceries', category: 'Groceries', amount_cents: -1000, date: '2025-01-01' });
    insertTransaction({ accountId, description: 'Old rent', category: 'Rent', amount_cents: -50000, date: '2025-01-02' });
    insertTransaction({ accountId, description: 'New groceries', category: 'Groceries', amount_cents: -2000, date: '2026-01-10' });

    const points = getBalanceOverTime(accountId, '2026-01-01', { category: 'Groceries' });

    // starting balance should only include the pre-window Groceries transaction (-1000), not Rent (-50000)
    t.equal(points[0].balance_cents, -1000);
    t.equal(points[points.length - 1].balance_cents, -3000);
});
