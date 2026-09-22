import db from '../db';
import { findByTransactionIds, type TagRef } from '../tags/repository';

export type RecurrenceFrequency = 'daily' | 'weekly' | 'fortnightly' | 'monthly' | 'yearly';

export interface Transaction {
    id: number;
    account_id: number;
    category: string | null;
    description: string;
    amount_cents: number;
    type: 'income' | 'expense' | 'transfer';
    date: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    recurrence: RecurrenceFrequency | null;
    recurrence_end_date: string | null;
    recurrence_source_id: number | null;
    transfer_group_id: string | null;
    cleared_at: string | null;
    split_parent_id: number | null;
    split_count: number;
    tags: TagRef[];
}

export interface SplitChildInput {
    amount_cents: number;
    category: string;
    notes: string | null;
}

export interface CreateTransactionInput {
    account_id: number;
    category?: string;
    description: string;
    amount: number;
    type: 'income' | 'expense' | 'transfer';
    date: string;
    notes?: string;
    recurrence?: RecurrenceFrequency;
    recurrence_end_date?: string;
    transfer_group_id?: string;
}

export interface UpdateTransactionInput {
    account_id?: number;
    category?: string | null;
    description?: string;
    amount?: number;
    type?: 'income' | 'expense';
    date?: string;
    notes?: string | null;
    recurrence?: RecurrenceFrequency | null;
    recurrence_end_date?: string | null;
}

// Expenses are stored as negative cents; income as positive. UI always displays absolute values.
function toAmountCents(amount: number, type: 'income' | 'expense'): number {
    const abs = Math.round(Math.abs(amount) * 100);
    return type === 'income' ? abs : -abs;
}

// Transfers are always stored as positive cents (direction comes from the paired transfer row, not the sign).
export function computeAmountCents(amount: number, type: 'income' | 'expense' | 'transfer'): number {
    if (type === 'transfer') return Math.round(Math.abs(amount) * 100);
    return toAmountCents(amount, type);
}

export interface TransactionFilters {
    keyword?: string;
    from?: string;
    to?: string;
    category?: string;
    type?: 'income' | 'expense';
    amountMin?: number;
    amountMax?: number;
    hasAttachment?: boolean;
    recurringOnly?: boolean;
    tagIds?: number[];
    tagMode?: 'any' | 'all';
    cleared?: 'yes' | 'no';
}

function splitCountSql(alias = 'transactions'): string {
    return `(SELECT COUNT(*) FROM transactions c WHERE c.split_parent_id = ${alias}.id AND c.deleted_at IS NULL) AS split_count`;
}

function stitchTags<T extends { id: number }>(rows: T[]): (T & { tags: TagRef[] })[] {
    if (rows.length === 0) return rows.map((r) => ({ ...r, tags: [] }));
    const map = findByTransactionIds(rows.map((r) => r.id));
    return rows.map((r) => ({ ...r, tags: map.get(r.id) ?? [] }));
}

function buildFilterClauses(filters: TransactionFilters | undefined, tableAlias = ''): { conditions: string[]; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];
    // Fully qualify when the caller didn't supply an alias — bare column names in correlated
    // EXISTS subqueries can resolve to the inner table's columns (e.g. attachments.id).
    const qualifier = tableAlias || 'transactions';
    const col = (c: string) => `${qualifier}.${c}`;

    if (filters?.keyword) {
        conditions.push(
            `(${col('description')} LIKE ? OR ${col('notes')} LIKE ? OR ${col('category')} LIKE ?)`,
        );
        const kw = `%${filters.keyword}%`;
        params.push(kw, kw, kw);
    }
    if (filters?.from) {
        conditions.push(`${col('date')} >= ?`);
        params.push(filters.from);
    }
    if (filters?.to) {
        conditions.push(`${col('date')} <= ?`);
        params.push(filters.to);
    }
    if (filters?.category) {
        conditions.push(`${col('category')} = ?`);
        params.push(filters.category);
    }
    if (filters?.type) {
        conditions.push(`${col('type')} = ?`);
        params.push(filters.type);
    }
    if (filters?.amountMin !== undefined) {
        // ABS() because expenses are stored as negative but the user provides a positive bound
        conditions.push(`ABS(${col('amount_cents')}) >= ?`);
        params.push(Math.round(filters.amountMin * 100));
    }
    if (filters?.amountMax !== undefined) {
        conditions.push(`ABS(${col('amount_cents')}) <= ?`);
        params.push(Math.round(filters.amountMax * 100));
    }
    if (filters?.hasAttachment === true) {
        conditions.push(
            `EXISTS (SELECT 1 FROM attachments a WHERE a.transaction_id = ${col('id')} AND a.deleted_at IS NULL)`,
        );
    } else if (filters?.hasAttachment === false) {
        conditions.push(
            `NOT EXISTS (SELECT 1 FROM attachments a WHERE a.transaction_id = ${col('id')} AND a.deleted_at IS NULL)`,
        );
    }
    if (filters?.recurringOnly) {
        conditions.push(`(${col('recurrence')} IS NOT NULL OR ${col('recurrence_source_id')} IS NOT NULL)`);
    }
    if (filters?.tagIds && filters.tagIds.length > 0) {
        if (filters.tagMode === 'all') {
            for (const tagId of filters.tagIds) {
                conditions.push(`EXISTS (SELECT 1 FROM transaction_tags tt WHERE tt.transaction_id = ${col('id')} AND tt.tag_id = ?)`);
                params.push(tagId);
            }
        } else {
            const tagPlaceholders = filters.tagIds.map(() => '?').join(',');
            conditions.push(`EXISTS (SELECT 1 FROM transaction_tags tt WHERE tt.transaction_id = ${col('id')} AND tt.tag_id IN (${tagPlaceholders}))`);
            params.push(...filters.tagIds);
        }
    }
    if (filters?.cleared === 'yes') {
        conditions.push(`${col('cleared_at')} IS NOT NULL`);
    } else if (filters?.cleared === 'no') {
        conditions.push(`${col('cleared_at')} IS NULL`);
    }

    return { conditions, params };
}

export function findByAccount(accountId: number, filters?: TransactionFilters): Transaction[] {
    const { conditions, params } = buildFilterClauses(filters);
    const allConditions = ['account_id = ?', 'deleted_at IS NULL', 'split_parent_id IS NULL', ...conditions];
    const allParams = [accountId, ...params];

    const sql = `SELECT *, ${splitCountSql()} FROM transactions WHERE ${allConditions.join(' AND ')} ORDER BY date DESC, id DESC`;
    const rows = db.prepare(sql).all(...allParams) as Omit<Transaction, 'tags'>[];
    return stitchTags(rows) as Transaction[];
}

export interface TransactionWithAccount extends Transaction {
    account_name: string;
}

export function searchAll(filters?: TransactionFilters): TransactionWithAccount[] {
    const { conditions, params } = buildFilterClauses(filters, 't');
    const allConditions = ['t.deleted_at IS NULL', 'a.deleted_at IS NULL', 't.split_parent_id IS NULL', ...conditions];

    const sql = `SELECT t.*, ${splitCountSql('t')}, a.name AS account_name
                 FROM transactions t
                 JOIN accounts a ON a.id = t.account_id
                 WHERE ${allConditions.join(' AND ')}
                 ORDER BY t.date DESC, t.id DESC`;
    const rows = db.prepare(sql).all(...params) as Omit<TransactionWithAccount, 'tags'>[];
    return stitchTags(rows) as TransactionWithAccount[];
}

export function findById(id: number): Transaction | undefined {
    const row = db
        .prepare(`SELECT *, ${splitCountSql()} FROM transactions WHERE id = ? AND deleted_at IS NULL`)
        .get(id) as Omit<Transaction, 'tags'> | undefined;
    if (!row) return undefined;
    return stitchTags([row])[0] as Transaction;
}

export function findChildren(parentId: number): Transaction[] {
    const rows = db
        .prepare(`SELECT *, ${splitCountSql()} FROM transactions WHERE split_parent_id = ? AND deleted_at IS NULL ORDER BY id`)
        .all(parentId) as Omit<Transaction, 'tags'>[];
    return stitchTags(rows) as Transaction[];
}

export function create(input: CreateTransactionInput): Transaction {
    const amount_cents = computeAmountCents(input.amount, input.type);
    const result = db
        .prepare(
            `INSERT INTO transactions (account_id, category, description, amount_cents, type, date, notes, recurrence, recurrence_end_date, transfer_group_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
            input.account_id,
            input.category ?? null,
            input.description,
            amount_cents,
            input.type,
            input.date,
            input.notes ?? null,
            input.recurrence ?? null,
            input.recurrence_end_date ?? null,
            input.transfer_group_id ?? null,
        );
    return findById(result.lastInsertRowid as number)!;
}

export function update(id: number, input: UpdateTransactionInput): Transaction | undefined {
    const existing = findById(id);
    if (!existing) return undefined;

    const newType = input.type ?? existing.type;
    const newAmount =
        input.amount !== undefined ? input.amount : Math.abs(existing.amount_cents) / 100;
    const amount_cents = newType === 'transfer'
        ? (existing.amount_cents < 0 ? -Math.round(newAmount * 100) : Math.round(newAmount * 100))
        : toAmountCents(newAmount, newType);

    db.prepare(
        `UPDATE transactions
         SET account_id = ?, category = ?, description = ?, amount_cents = ?, type = ?, date = ?, notes = ?,
             recurrence = ?, recurrence_end_date = ?, updated_at = datetime('now')
         WHERE id = ? AND deleted_at IS NULL`,
    ).run(
        input.account_id ?? existing.account_id,
        input.category !== undefined ? input.category : existing.category,
        input.description ?? existing.description,
        amount_cents,
        newType,
        input.date ?? existing.date,
        input.notes !== undefined ? input.notes : existing.notes,
        // 'in' rather than !== undefined: allows passing null to explicitly clear the recurrence
        'recurrence' in input ? (input.recurrence ?? null) : existing.recurrence,
        'recurrence_end_date' in input ? (input.recurrence_end_date ?? null) : existing.recurrence_end_date,
        id,
    );
    return findById(id);
}

export function softDelete(id: number): boolean {
    const deleteAttachments = db.prepare(
        `UPDATE attachments SET deleted_at = datetime('now') WHERE transaction_id = ? AND deleted_at IS NULL`,
    );
    const deleteTransaction = db.prepare(
        `UPDATE transactions SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`,
    );

    const run = db.transaction((txId: number) => {
        deleteAttachments.run(txId);
        const result = deleteTransaction.run(txId);
        return result.changes > 0;
    });

    return run(id) as boolean;
}

export function bulkSoftDelete(ids: number[], accountId: number): boolean {
    if (ids.length === 0) return false;

    const placeholders = ids.map(() => '?').join(',');
    const owned = db
        .prepare(`SELECT COUNT(*) as cnt FROM transactions WHERE id IN (${placeholders}) AND account_id = ? AND deleted_at IS NULL`)
        .get(...ids, accountId) as { cnt: number };
    if (owned.cnt !== ids.length) return false;

    const deleteAttachments = db.prepare(
        `UPDATE attachments SET deleted_at = datetime('now') WHERE transaction_id IN (${placeholders}) AND deleted_at IS NULL`,
    );
    const deleteTransactions = db.prepare(
        `UPDATE transactions SET deleted_at = datetime('now') WHERE id IN (${placeholders}) AND account_id = ? AND deleted_at IS NULL`,
    );

    db.transaction(() => {
        deleteAttachments.run(...ids);
        deleteTransactions.run(...ids, accountId);
    })();

    return true;
}

export function findByIds(ids: number[], accountId: number): Transaction[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    return db
        .prepare(`SELECT * FROM transactions WHERE id IN (${placeholders}) AND account_id = ? AND deleted_at IS NULL ORDER BY date DESC, id DESC`)
        .all(...ids, accountId) as Transaction[];
}

export function softDeleteFutureOccurrences(templateId: number, fromDate: string): void {
    const toDeleteIds = db
        .prepare(
            `SELECT id FROM transactions
             WHERE recurrence_source_id = ? AND date >= ? AND deleted_at IS NULL`,
        )
        .all(templateId, fromDate)
        .map((r) => (r as { id: number }).id);

    if (toDeleteIds.length === 0) return;

    const placeholders = toDeleteIds.map(() => '?').join(',');
    db.prepare(`UPDATE attachments SET deleted_at = datetime('now') WHERE transaction_id IN (${placeholders}) AND deleted_at IS NULL`).run(...toDeleteIds);
    db.prepare(`UPDATE transactions SET deleted_at = datetime('now') WHERE id IN (${placeholders}) AND deleted_at IS NULL`).run(...toDeleteIds);
}

export function updateTemplateEndDate(templateId: number, endDate: string): void {
    db.prepare(`UPDATE transactions SET recurrence_end_date = ?, updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`).run(endDate, templateId);
}

export function getBalance(accountId: number): number {
    const row = db
        .prepare(
            'SELECT COALESCE(SUM(amount_cents), 0) AS balance FROM transactions WHERE account_id = ? AND deleted_at IS NULL AND split_parent_id IS NULL',
        )
        .get(accountId) as { balance: number };
    return row.balance;
}

export function getClearedBalance(accountId: number): number {
    const row = db
        .prepare(
            'SELECT COALESCE(SUM(amount_cents), 0) AS balance FROM transactions WHERE account_id = ? AND cleared_at IS NOT NULL AND deleted_at IS NULL AND split_parent_id IS NULL',
        )
        .get(accountId) as { balance: number };
    return row.balance;
}

export const SPLIT_CATEGORY = '(split)';
export const UNCATEGORISED = '(uncategorised)';

export function applySplits(parentId: number, children: SplitChildInput[]): Transaction[] {
    const parent = findById(parentId);
    if (!parent) throw new Error('parent transaction not found');

    const softDeleteExisting = db.prepare(
        `UPDATE transactions SET deleted_at = datetime('now') WHERE split_parent_id = ? AND deleted_at IS NULL`,
    );
    const insertChild = db.prepare(
        `INSERT INTO transactions (account_id, category, description, amount_cents, type, date, notes, split_parent_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const setParentCategory = db.prepare(`UPDATE transactions SET category = ? WHERE id = ?`);

    const run = db.transaction(() => {
        softDeleteExisting.run(parentId);
        const ids: number[] = [];
        for (const child of children) {
            const result = insertChild.run(
                parent.account_id,
                child.category,
                child.category,
                child.amount_cents,
                parent.type,
                parent.date,
                child.notes,
                parentId,
            );
            ids.push(result.lastInsertRowid as number);
        }
        setParentCategory.run(SPLIT_CATEGORY, parentId);
        return ids;
    });

    const ids = run() as number[];
    return ids.map((id) => findById(id)!);
}

export function unsplit(parentId: number): Transaction | undefined {
    const parent = findById(parentId);
    if (!parent) return undefined;

    const softDeleteExisting = db.prepare(
        `UPDATE transactions SET deleted_at = datetime('now') WHERE split_parent_id = ? AND deleted_at IS NULL`,
    );
    const restoreCategory = db.prepare(`UPDATE transactions SET category = ? WHERE id = ?`);

    db.transaction(() => {
        softDeleteExisting.run(parentId);
        if (parent.category === SPLIT_CATEGORY) {
            restoreCategory.run(UNCATEGORISED, parentId);
        }
    })();

    return findById(parentId);
}

export function clear(id: number): void {
    db.prepare(
        `UPDATE transactions SET cleared_at = datetime('now') WHERE id = ? AND cleared_at IS NULL`,
    ).run(id);
}

export function unclear(id: number): void {
    db.prepare(`UPDATE transactions SET cleared_at = NULL WHERE id = ?`).run(id);
}
