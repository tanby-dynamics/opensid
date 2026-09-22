import db from '../db';
import { REPORTING_ROWS_CTE } from '../reporting/view';

export interface IncomeVsExpensePoint {
    month: string;
    income_cents: number;
    expense_cents: number;
}

export interface BalancePoint {
    date: string;
    balance_cents: number;
}

export interface CategoryTotal {
    category: string;
    total_cents: number;
}

export function parseWindowToFromDate(window: string): string | null {
    const now = new Date();
    if (window === 'all') return null;
    if (window === '30d') {
        now.setDate(now.getDate() - 30);
        return now.toISOString().slice(0, 10);
    }
    if (window === '3m') {
        now.setMonth(now.getMonth() - 3);
        return now.toISOString().slice(0, 10);
    }
    if (window === '6m') {
        now.setMonth(now.getMonth() - 6);
        return now.toISOString().slice(0, 10);
    }
    if (window === '12m') {
        now.setFullYear(now.getFullYear() - 1);
        return now.toISOString().slice(0, 10);
    }
    const weeksMatch = window.match(/^(\d+)w$/);
    if (weeksMatch) {
        const weeks = parseInt(weeksMatch[1], 10);
        now.setDate(now.getDate() - weeks * 7);
        return now.toISOString().slice(0, 10);
    }
    return undefined as never;
}

export function isValidWindow(window: string): boolean {
    if (window === 'all' || window === '30d' || window === '3m' || window === '6m' || window === '12m') return true;
    const m = window.match(/^(\d+)w$/);
    if (m) {
        const n = parseInt(m[1], 10);
        return n >= 1 && n <= 52;
    }
    return false;
}

export function getBalanceOverTime(accountId: number, fromDate: string | null): BalancePoint[] {
    // Starting balance: sum of all transactions before the window
    let startingBalance = 0;
    if (fromDate) {
        const row = db
            .prepare(
                `SELECT COALESCE(SUM(amount_cents), 0) AS total
                 FROM transactions
                 WHERE account_id = ? AND deleted_at IS NULL AND split_parent_id IS NULL AND date < ?`,
            )
            .get(accountId, fromDate) as { total: number };
        startingBalance = row.total;
    }

    // Transactions within the window, grouped by date (chronological)
    const rows = fromDate
        ? (db
              .prepare(
                  `SELECT date, SUM(amount_cents) AS day_delta
                   FROM transactions
                   WHERE account_id = ? AND deleted_at IS NULL AND split_parent_id IS NULL AND date >= ?
                   GROUP BY date
                   ORDER BY date ASC`,
              )
              .all(accountId, fromDate) as { date: string; day_delta: number }[])
        : (db
              .prepare(
                  `SELECT date, SUM(amount_cents) AS day_delta
                   FROM transactions
                   WHERE account_id = ? AND deleted_at IS NULL AND split_parent_id IS NULL
                   GROUP BY date
                   ORDER BY date ASC`,
              )
              .all(accountId) as { date: string; day_delta: number }[]);

    const points: BalancePoint[] = [];
    let running = startingBalance;

    if (fromDate && rows.length > 0) {
        points.push({ date: fromDate, balance_cents: running });
    }

    for (const row of rows) {
        running += row.day_delta;
        points.push({ date: row.date, balance_cents: running });
    }

    // Always extend to today so the chart reaches the present even when all transactions are in the past
    const today = new Date().toISOString().slice(0, 10);
    if (points.length === 0 || points[points.length - 1].date < today) {
        points.push({ date: today, balance_cents: running });
    }

    return points;
}

export function getIncomeVsExpenseByMonth(accountId: number, fromDate: string | null): IncomeVsExpensePoint[] {
    const rows = fromDate
        ? (db
              .prepare(
                  `SELECT strftime('%Y-%m', date) as month, type, SUM(amount_cents) as total_cents
                   FROM transactions
                   WHERE account_id = ? AND deleted_at IS NULL AND split_parent_id IS NULL AND type != 'transfer' AND date >= ?
                   GROUP BY month, type
                   ORDER BY month`,
              )
              .all(accountId, fromDate) as { month: string; type: string; total_cents: number }[])
        : (db
              .prepare(
                  `SELECT strftime('%Y-%m', date) as month, type, SUM(amount_cents) as total_cents
                   FROM transactions
                   WHERE account_id = ? AND deleted_at IS NULL AND split_parent_id IS NULL AND type != 'transfer'
                   GROUP BY month, type
                   ORDER BY month`,
              )
              .all(accountId) as { month: string; type: string; total_cents: number }[]);

    if (rows.length === 0) return [];

    // Determine the month range
    const now = new Date();
    const endMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const firstMonth = fromDate
        ? `${fromDate.slice(0, 4)}-${fromDate.slice(5, 7)}`
        : rows[0].month;

    // Build a map from the query results
    const map = new Map<string, { income_cents: number; expense_cents: number }>();
    for (const row of rows) {
        if (!map.has(row.month)) map.set(row.month, { income_cents: 0, expense_cents: 0 });
        const entry = map.get(row.month)!;
        if (row.type === 'income') entry.income_cents += row.total_cents;
        else if (row.type === 'expense') entry.expense_cents += Math.abs(row.total_cents); // stored negative
    }

    // Fill all months in the window
    const result: IncomeVsExpensePoint[] = [];
    let [y, m] = firstMonth.split('-').map(Number);
    const [ey, em] = endMonth.split('-').map(Number);
    while (y < ey || (y === ey && m <= em)) {
        const key = `${y}-${String(m).padStart(2, '0')}`;
        const entry = map.get(key) ?? { income_cents: 0, expense_cents: 0 };
        result.push({ month: key, ...entry });
        m++;
        if (m > 12) { m = 1; y++; }
    }

    return result;
}

export function getCategoryTotals(accountId: number, fromDate: string | null): CategoryTotal[] {
    const rows = fromDate
        ? (db
              .prepare(
                  `WITH ${REPORTING_ROWS_CTE}
                   SELECT category, SUM(ABS(amount_cents)) AS total_cents
                   FROM reporting_rows
                   WHERE account_id = ? AND type = 'expense'
                     AND category IS NOT NULL AND date >= ?
                   GROUP BY category
                   ORDER BY total_cents DESC`,
              )
              .all(accountId, fromDate) as CategoryTotal[])
        : (db
              .prepare(
                  `WITH ${REPORTING_ROWS_CTE}
                   SELECT category, SUM(ABS(amount_cents)) AS total_cents
                   FROM reporting_rows
                   WHERE account_id = ? AND type = 'expense'
                     AND category IS NOT NULL
                   GROUP BY category
                   ORDER BY total_cents DESC`,
              )
              .all(accountId) as CategoryTotal[]);
    return rows;
}
