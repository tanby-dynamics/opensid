// Shared CTE for reporting queries (category/budget/tag aggregation): returns a split
// parent's children when it has any, and the transaction itself otherwise. Used so a
// split parent's `(split)` category never appears in aggregates — its children's real
// categories do.
export const REPORTING_ROWS_CTE = `
    reporting_rows AS (
        SELECT * FROM transactions WHERE deleted_at IS NULL AND split_parent_id IS NULL
            AND NOT EXISTS (SELECT 1 FROM transactions c WHERE c.split_parent_id = transactions.id AND c.deleted_at IS NULL)
        UNION ALL
        SELECT * FROM transactions WHERE deleted_at IS NULL AND split_parent_id IS NOT NULL
    )
`;
