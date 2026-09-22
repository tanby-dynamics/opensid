import { Router } from 'express';
import db from '../db';
import { REPORTING_ROWS_CTE } from '../reporting/view';

const router = Router();

router.get('/spend-by-tag', (req, res) => {
    const { from, to, account_id } = req.query as Record<string, string | undefined>;

    const dateFrom = from || null;
    const dateTo = to || null;
    const accountId = account_id ? parseInt(account_id, 10) : null;

    const tagRows = db.prepare(`
        WITH ${REPORTING_ROWS_CTE}
        SELECT t.id AS tag_id, t.name, t.colour,
               COUNT(tx.id) AS transaction_count,
               COALESCE(SUM(ABS(tx.amount_cents)), 0) AS total_cents
        FROM tags t
        LEFT JOIN transaction_tags tt ON tt.tag_id = t.id
        LEFT JOIN reporting_rows tx ON tx.id = tt.transaction_id
            AND tx.type = 'expense'
            AND (? IS NULL OR tx.date >= ?)
            AND (? IS NULL OR tx.date <= ?)
            AND (? IS NULL OR tx.account_id = ?)
        WHERE t.deleted_at IS NULL
        GROUP BY t.id
        ORDER BY total_cents DESC
    `).all(dateFrom, dateFrom, dateTo, dateTo, accountId, accountId) as {
        tag_id: number;
        name: string;
        colour: string | null;
        transaction_count: number;
        total_cents: number;
    }[];

    const untaggedRow = db.prepare(`
        WITH ${REPORTING_ROWS_CTE}
        SELECT COUNT(tx.id) AS transaction_count,
               COALESCE(SUM(ABS(tx.amount_cents)), 0) AS total_cents
        FROM reporting_rows tx
        WHERE tx.type = 'expense'
            AND NOT EXISTS (SELECT 1 FROM transaction_tags tt WHERE tt.transaction_id = tx.id)
            AND (? IS NULL OR tx.date >= ?)
            AND (? IS NULL OR tx.date <= ?)
            AND (? IS NULL OR tx.account_id = ?)
    `).get(dateFrom, dateFrom, dateTo, dateTo, accountId, accountId) as {
        transaction_count: number;
        total_cents: number;
    };

    res.json([
        ...tagRows,
        { tag_id: null, name: '(untagged)', colour: null, ...untaggedRow },
    ]);
});

export default router;
