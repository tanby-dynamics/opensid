import db from '../db';
import { generateTransferGroupId } from '../transfers/repository';

export type Frequency = 'daily' | 'weekly' | 'fortnightly' | 'monthly' | 'yearly';

interface TemplateRow {
    id: number;
    account_id: number;
    category: string | null;
    description: string;
    amount_cents: number;
    type: string;
    notes: string | null;
    recurrence: Frequency;
    recurrence_end_date: string | null;
    transfer_group_id: string | null;
}

export function getNextDate(dateStr: string, frequency: Frequency): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (frequency === 'daily') {
        return toDateStr(y, m, d + 1);
    }
    if (frequency === 'weekly') {
        return toDateStr(y, m, d + 7);
    }
    if (frequency === 'fortnightly') {
        return toDateStr(y, m, d + 14);
    }
    if (frequency === 'monthly') {
        const nextMonth = m === 12 ? 1 : m + 1;
        const nextYear = m === 12 ? y + 1 : y;
        const lastDay = daysInMonth(nextYear, nextMonth);
        return toDateStr(nextYear, nextMonth, Math.min(d, lastDay));
    }
    // yearly
    const nextYear = y + 1;
    const lastDay = daysInMonth(nextYear, m);
    return toDateStr(nextYear, m, Math.min(d, lastDay));
}

function daysInMonth(year: number, month: number): number {
    return new Date(year, month, 0).getDate();
}

function toDateStr(y: number, m: number, d: number): string {
    // Handle overflow: d > daysInMonth, m > 12
    const date = new Date(y, m - 1, d);
    const yy = date.getFullYear();
    const mm = date.getMonth() + 1;
    const dd = date.getDate();
    return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

export function today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function generateDueOccurrences(): void {
    const todayStr = today();

    const templates = db
        .prepare(
            `SELECT id, account_id, category, description, amount_cents, type, notes, recurrence, recurrence_end_date, transfer_group_id
             FROM transactions
             WHERE recurrence IS NOT NULL AND recurrence_source_id IS NULL AND deleted_at IS NULL`,
        )
        .all() as TemplateRow[];

    const insertStmt = db.prepare(
        `INSERT INTO transactions (account_id, category, description, amount_cents, type, date, notes, recurrence_source_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const insertTransferStmt = db.prepare(
        `INSERT INTO transactions (account_id, category, description, amount_cents, type, date, notes, transfer_group_id, recurrence_source_id)
         VALUES (?, ?, ?, ?, 'transfer', ?, ?, ?, ?)`,
    );

    const findSplitChildren = db.prepare(
        `SELECT category, description, amount_cents, notes FROM transactions
         WHERE split_parent_id = ? AND deleted_at IS NULL`,
    );

    const insertChildStmt = db.prepare(
        `INSERT INTO transactions (account_id, category, description, amount_cents, type, date, notes, split_parent_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    function replicateSplitChildren(templateId: number, occurrenceId: number, accountId: number, type: string, date: string) {
        const children = findSplitChildren.all(templateId) as { category: string | null; description: string; amount_cents: number; notes: string | null }[];
        for (const child of children) {
            insertChildStmt.run(accountId, child.category, child.description, child.amount_cents, type, date, child.notes, occurrenceId);
        }
    }

    const run = db.transaction(() => {
        for (const tmpl of templates) {
            const lastRow = db
                .prepare(
                    `SELECT MAX(date) AS last_date FROM transactions
                     WHERE (id = ? OR recurrence_source_id = ?) AND deleted_at IS NULL`,
                )
                .get(tmpl.id, tmpl.id) as { last_date: string | null };

            let lastDate = lastRow.last_date ?? tmpl.recurrence_end_date;
            if (!lastDate) continue;

            const ceiling = tmpl.recurrence_end_date && tmpl.recurrence_end_date < todayStr
                ? tmpl.recurrence_end_date
                : todayStr;

            if (tmpl.type === 'transfer' && tmpl.transfer_group_id) {
                // Find the destination partner template
                const destTmpl = db
                    .prepare(
                        `SELECT id, account_id, category, description, amount_cents, notes
                         FROM transactions
                         WHERE transfer_group_id = ? AND id != ? AND deleted_at IS NULL AND recurrence_source_id IS NULL`,
                    )
                    .get(tmpl.transfer_group_id, tmpl.id) as Pick<TemplateRow, 'id' | 'account_id' | 'category' | 'description' | 'amount_cents' | 'notes'> | undefined;

                if (!destTmpl) continue;

                let next = getNextDate(lastDate, tmpl.recurrence);
                while (next <= ceiling) {
                    const newGroupId = generateTransferGroupId();
                    insertTransferStmt.run(tmpl.account_id, tmpl.category, tmpl.description, tmpl.amount_cents, next, tmpl.notes, newGroupId, tmpl.id);
                    insertTransferStmt.run(destTmpl.account_id, destTmpl.category, destTmpl.description, destTmpl.amount_cents, next, destTmpl.notes, newGroupId, tmpl.id);
                    lastDate = next;
                    next = getNextDate(lastDate, tmpl.recurrence);
                }
            } else {
                let next = getNextDate(lastDate, tmpl.recurrence);
                while (next <= ceiling) {
                    const result = insertStmt.run(
                        tmpl.account_id,
                        tmpl.category,
                        tmpl.description,
                        tmpl.amount_cents,
                        tmpl.type,
                        next,
                        tmpl.notes,
                        tmpl.id,
                    );
                    replicateSplitChildren(tmpl.id, result.lastInsertRowid as number, tmpl.account_id, tmpl.type, next);
                    lastDate = next;
                    next = getNextDate(lastDate, tmpl.recurrence);
                }
            }
        }
    });

    run();
}
