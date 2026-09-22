import db from '../db';
import { REPORTING_ROWS_CTE } from '../reporting/view';

export interface Budget {
    id: number;
    account_id: number;
    category: string;
    amount_cents: number;
    period: 'monthly' | 'weekly';
    warning_threshold: number;
    danger_threshold: number;
    created_at: string;
    deleted_at: string | null;
}

export interface BudgetProgress extends Budget {
    spent_cents: number;
    percent: number;
}

export interface CreateBudgetInput {
    category: string;
    amount_cents: number;
    period: 'monthly' | 'weekly';
    warning_threshold: number;
    danger_threshold: number;
}

function getMonthStart(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function getWeekStart(): string {
    const now = new Date();
    const day = now.getDay(); // 0=Sun, 1=Mon...
    const diff = (day === 0 ? -6 : 1 - day);
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    return monday.toISOString().slice(0, 10);
}

export function getBudgets(accountId: number): Budget[] {
    return db
        .prepare(`SELECT * FROM budgets WHERE account_id = ? AND deleted_at IS NULL ORDER BY category`)
        .all(accountId) as Budget[];
}

export function getBudgetProgress(accountId: number): BudgetProgress[] {
    const budgets = getBudgets(accountId);
    if (budgets.length === 0) return [];

    const monthStart = getMonthStart();
    const weekStart = getWeekStart();

    return budgets.map((b) => {
        const periodStart = b.period === 'monthly' ? monthStart : weekStart;
        const row = db
            .prepare(
                `WITH ${REPORTING_ROWS_CTE}
                 SELECT COALESCE(SUM(ABS(amount_cents)), 0) AS spent_cents
                 FROM reporting_rows
                 WHERE account_id = ? AND category = ? AND type = 'expense'
                   AND date >= ?`,
            )
            .get(accountId, b.category, periodStart) as { spent_cents: number };
        const spent_cents = row.spent_cents;
        const percent = b.amount_cents > 0 ? Math.round((spent_cents / b.amount_cents) * 100) : 0;
        return { ...b, spent_cents, percent };
    });
}

export function createBudget(accountId: number, input: CreateBudgetInput): Budget {
    const result = db
        .prepare(
            `INSERT INTO budgets (account_id, category, amount_cents, period, warning_threshold, danger_threshold)
             VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(accountId, input.category, input.amount_cents, input.period, input.warning_threshold, input.danger_threshold);
    return db
        .prepare(`SELECT * FROM budgets WHERE id = ?`)
        .get(result.lastInsertRowid) as Budget;
}

export function updateBudget(id: number, accountId: number, input: Partial<CreateBudgetInput>): Budget | undefined {
    const existing = db
        .prepare(`SELECT * FROM budgets WHERE id = ? AND account_id = ? AND deleted_at IS NULL`)
        .get(id, accountId) as Budget | undefined;
    if (!existing) return undefined;

    db.prepare(
        `UPDATE budgets SET
            category = ?, amount_cents = ?, period = ?, warning_threshold = ?, danger_threshold = ?
         WHERE id = ? AND account_id = ?`,
    ).run(
        input.category ?? existing.category,
        input.amount_cents ?? existing.amount_cents,
        input.period ?? existing.period,
        input.warning_threshold ?? existing.warning_threshold,
        input.danger_threshold ?? existing.danger_threshold,
        id,
        accountId,
    );
    return db.prepare(`SELECT * FROM budgets WHERE id = ?`).get(id) as Budget;
}

export function softDeleteBudget(id: number, accountId: number): boolean {
    const result = db
        .prepare(`UPDATE budgets SET deleted_at = datetime('now') WHERE id = ? AND account_id = ? AND deleted_at IS NULL`)
        .run(id, accountId);
    return result.changes > 0;
}
