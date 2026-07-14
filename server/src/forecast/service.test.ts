import t from 'tap';
import db from '../db';
import { computeForecast, averageDailyDiscretionary } from './service';

function resetDatabase() {
    db.exec(`
        DELETE FROM attachments;
        DELETE FROM transactions;
        DELETE FROM dashboard_config;
        DELETE FROM accounts;
    `);
}

function todayStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr: string, delta: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d + delta);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function insertAccount(name: string): number {
    return Number(db.prepare(`INSERT INTO accounts (name) VALUES (?)`).run(name).lastInsertRowid);
}

function insertTransaction(
    accountId: number,
    amountCents: number,
    date: string,
    type: 'income' | 'expense' | 'transfer' = 'income',
    opts: { recurrence?: string | null; recurrenceEndDate?: string | null; transferGroupId?: string | null; deleted?: boolean } = {},
): number {
    return Number(
        db.prepare(
            `INSERT INTO transactions (account_id, description, category, amount_cents, type, date, recurrence, recurrence_end_date, transfer_group_id, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
            accountId, 'tx', 'tx', amountCents, type, date,
            opts.recurrence ?? null, opts.recurrenceEndDate ?? null, opts.transferGroupId ?? null,
            opts.deleted ? "2026-01-01 00:00:00" : null,
        ).lastInsertRowid,
    );
}

t.beforeEach(() => {
    resetDatabase();
});

t.teardown(() => {
    resetDatabase();
});

t.test('daily recurring expense produces a known declining line', (t) => {
    const account = insertAccount('Everyday');
    insertTransaction(account, 100000, todayStr(), 'income');
    insertTransaction(account, -1000, todayStr(), 'expense', { recurrence: 'daily' });

    const result = computeForecast({ accountId: account, days: 3, includeDiscretionary: false });

    t.equal(result.starting_balance_cents, 99000);
    t.equal(result.daily.length, 3);
    t.equal(result.daily[0].date, addDays(todayStr(), 1));
    t.equal(result.daily[0].balance_cents, 98000);
    t.equal(result.daily[1].balance_cents, 97000);
    t.equal(result.daily[2].balance_cents, 96000);
    t.equal(result.closing_balance_cents, 96000);
    t.equal(result.lowest_balance_cents, 96000);
    t.equal(result.lowest_balance_date, addDays(todayStr(), 3));
    t.equal(result.zero_crossing_date, null);
    t.equal(result.events.length, 3);
    t.end();
});

t.test('discretionary estimate applies a flat per-day rate', (t) => {
    const account = insertAccount('Everyday');
    insertTransaction(account, 100000, todayStr(), 'income');
    // 90-day average: $90 total expense over the trailing window -> $1/day
    insertTransaction(account, -9000, addDays(todayStr(), -1), 'expense');

    const avg = averageDailyDiscretionary(account);
    t.equal(avg, 100);

    const result = computeForecast({ accountId: account, days: 2, includeDiscretionary: true });
    t.equal(result.discretionary_per_day_cents, 100);
    t.equal(result.starting_balance_cents, 91000);
    t.equal(result.daily[0].balance_cents, 91000 - 100);
    t.equal(result.daily[1].balance_cents, 91000 - 200);
    t.end();
});

t.test('zero crossing is detected on the first day balance goes negative', (t) => {
    const account = insertAccount('Everyday');
    insertTransaction(account, 500, todayStr(), 'income');
    insertTransaction(account, -1000, todayStr(), 'expense', { recurrence: 'daily' });

    const result = computeForecast({ accountId: account, days: 3, includeDiscretionary: false });

    t.equal(result.zero_crossing_date, addDays(todayStr(), 1));
    t.end();
});

t.test('stays positive reports no zero crossing', (t) => {
    const account = insertAccount('Everyday');
    insertTransaction(account, 1000000, todayStr(), 'income');
    insertTransaction(account, -1000, todayStr(), 'expense', { recurrence: 'daily' });

    const result = computeForecast({ accountId: account, days: 30, includeDiscretionary: false });

    t.equal(result.zero_crossing_date, null);
    t.end();
});

t.test('recurring transfer produces signed events on both source and destination accounts', (t) => {
    const source = insertAccount('Everyday');
    const dest = insertAccount('Savings');
    const groupId = 'abc123groupid';

    insertTransaction(source, -20000, todayStr(), 'transfer', { recurrence: 'daily', transferGroupId: groupId });
    insertTransaction(dest, 20000, todayStr(), 'transfer', { transferGroupId: groupId });

    const sourceForecast = computeForecast({ accountId: source, days: 1, includeDiscretionary: false });
    const destForecast = computeForecast({ accountId: dest, days: 1, includeDiscretionary: false });

    t.equal(sourceForecast.events[0].amount_cents, -20000);
    t.equal(destForecast.events[0].amount_cents, 20000);
    t.end();
});

t.test('soft-deleted recurring template contributes no events', (t) => {
    const account = insertAccount('Everyday');
    insertTransaction(account, 100000, todayStr(), 'income');
    insertTransaction(account, -1000, todayStr(), 'expense', { recurrence: 'daily', deleted: true });

    const result = computeForecast({ accountId: account, days: 3, includeDiscretionary: false });

    t.equal(result.events.length, 0);
    t.equal(result.closing_balance_cents, 100000);
    t.end();
});

t.test('recurrence_end_date stops events from extending past it', (t) => {
    const account = insertAccount('Everyday');
    insertTransaction(account, 100000, todayStr(), 'income');
    insertTransaction(account, -1000, todayStr(), 'expense', {
        recurrence: 'daily',
        recurrenceEndDate: addDays(todayStr(), 1),
    });

    const result = computeForecast({ accountId: account, days: 3, includeDiscretionary: false });

    t.equal(result.events.length, 1);
    t.equal(result.events[0].date, addDays(todayStr(), 1));
    t.end();
});
