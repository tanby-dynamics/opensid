import db from '../db';
import type { AccountKind } from '../accounts/repository';

export interface NetWorthAccount {
    id: number;
    name: string;
    kind: AccountKind;
    balance_cents: number;
}

export interface NetWorth {
    as_of: string;
    total_cents: number;
    assets_cents: number;
    liabilities_cents: number;
    accounts: NetWorthAccount[];
}

export interface NetWorthPoint {
    date: string;
    total_cents: number;
}

interface QualifyingAccount {
    id: number;
    name: string;
    kind: AccountKind;
}

function getQualifyingAccounts(): QualifyingAccount[] {
    return db
        .prepare(`SELECT id, name, kind FROM accounts WHERE deleted_at IS NULL AND exclude_from_net_worth = 0`)
        .all() as QualifyingAccount[];
}

export function getNetWorth(onDate?: string): NetWorth {
    const asOf = onDate ?? new Date().toISOString().slice(0, 10);
    const accounts = getQualifyingAccounts();

    const balanceRows = db
        .prepare(
            `SELECT account_id, COALESCE(SUM(amount_cents), 0) AS balance
             FROM transactions
             WHERE deleted_at IS NULL AND date <= ?
             GROUP BY account_id`,
        )
        .all(asOf) as { account_id: number; balance: number }[];
    const balances = new Map(balanceRows.map((r) => [r.account_id, r.balance]));

    let assetsCents = 0;
    let liabilitiesCents = 0;
    const result: NetWorthAccount[] = accounts.map((a) => {
        const balance = balances.get(a.id) ?? 0;
        if (a.kind === 'liability') {
            liabilitiesCents += Math.abs(balance);
        } else {
            assetsCents += balance;
        }
        return { id: a.id, name: a.name, kind: a.kind, balance_cents: balance };
    });

    return {
        as_of: asOf,
        total_cents: assetsCents - liabilitiesCents,
        assets_cents: assetsCents,
        liabilities_cents: liabilitiesCents,
        accounts: result,
    };
}

export function getNetWorthHistory(fromDate: string | null, toDate: string): NetWorthPoint[] {
    const accounts = getQualifyingAccounts();
    if (accounts.length === 0) return [];

    let resolvedFrom = fromDate;
    if (resolvedFrom === null) {
        const row = db.prepare(`SELECT MIN(date) AS min_date FROM transactions WHERE deleted_at IS NULL`).get() as {
            min_date: string | null;
        };
        resolvedFrom = row.min_date ?? toDate;
    }

    const accountKind = new Map(accounts.map((a) => [a.id, a.kind]));
    const running = new Map<number, number>();
    for (const a of accounts) running.set(a.id, 0);

    const startingRows = db
        .prepare(
            `SELECT account_id, COALESCE(SUM(amount_cents), 0) AS balance
             FROM transactions
             WHERE deleted_at IS NULL AND date < ?
             GROUP BY account_id`,
        )
        .all(resolvedFrom) as { account_id: number; balance: number }[];
    for (const row of startingRows) {
        if (running.has(row.account_id)) running.set(row.account_id, row.balance);
    }

    const deltaRows = db
        .prepare(
            `SELECT account_id, date, SUM(amount_cents) AS day_delta
             FROM transactions
             WHERE deleted_at IS NULL AND date >= ? AND date <= ?
             GROUP BY account_id, date
             ORDER BY date ASC`,
        )
        .all(resolvedFrom, toDate) as { account_id: number; date: string; day_delta: number }[];

    const deltasByDate = new Map<string, { account_id: number; day_delta: number }[]>();
    for (const row of deltaRows) {
        if (!running.has(row.account_id)) continue;
        if (!deltasByDate.has(row.date)) deltasByDate.set(row.date, []);
        deltasByDate.get(row.date)!.push(row);
    }

    function computeTotal(): number {
        let total = 0;
        for (const [accountId, balance] of running) {
            const kind = accountKind.get(accountId);
            total += kind === 'liability' ? -Math.abs(balance) : balance;
        }
        return total;
    }

    const points: NetWorthPoint[] = [];
    const cur = new Date(`${resolvedFrom}T00:00:00`);
    const end = new Date(`${toDate}T00:00:00`);
    while (cur <= end) {
        const dateStr = cur.toISOString().slice(0, 10);
        const dayDeltas = deltasByDate.get(dateStr);
        if (dayDeltas) {
            for (const d of dayDeltas) {
                running.set(d.account_id, (running.get(d.account_id) ?? 0) + d.day_delta);
            }
        }
        points.push({ date: dateStr, total_cents: computeTotal() });
        cur.setDate(cur.getDate() + 1);
    }

    return points;
}
