import db from '../db';

export type TileType =
    | 'transactions'
    | 'balance_over_time'
    | 'totals_by_category'
    | 'income_vs_expense'
    | 'budget_progress'
    | 'net_worth'
    | 'net_worth_chart'
    | 'forecast';

export const CROSS_ACCOUNT_TILE_TYPES: TileType[] = ['net_worth', 'net_worth_chart'];

export interface DashboardConfigItem {
    id: number;
    account_id: number | null;
    position: number;
    tile_type: TileType;
    time_window: string | null;
    show_balance: number; // 0 or 1
    forecast_discretionary: number; // 0 or 1
    balance_cents: number | null;
}

const SELECT_SQL = `
    SELECT dc.id, dc.account_id, dc.position, dc.tile_type, dc.time_window, dc.show_balance, dc.forecast_discretionary,
        CASE WHEN dc.tile_type IN ('transactions', 'balance_over_time')
            THEN (SELECT COALESCE(SUM(t.amount_cents), 0) FROM transactions t WHERE t.account_id = dc.account_id AND t.deleted_at IS NULL AND t.split_parent_id IS NULL)
            ELSE NULL
        END AS balance_cents
    FROM dashboard_config dc
`;

export function getAll(): DashboardConfigItem[] {
    return db
        .prepare(`${SELECT_SQL} ORDER BY dc.position`)
        .all() as DashboardConfigItem[];
}

export function add(accountId: number | null, tileType: TileType, timeWindow?: string, forecastDiscretionary = false): DashboardConfigItem {
    const maxRow = db
        .prepare('SELECT COALESCE(MAX(position), 0) AS max_pos FROM dashboard_config')
        .get() as { max_pos: number };
    const nextPos = maxRow.max_pos + 1;
    const result = db
        .prepare('INSERT INTO dashboard_config (account_id, position, tile_type, time_window, show_balance, forecast_discretionary) VALUES (?, ?, ?, ?, 0, ?)')
        .run(accountId, nextPos, tileType, timeWindow ?? null, forecastDiscretionary ? 1 : 0);
    return db
        .prepare(`${SELECT_SQL} WHERE dc.id = ?`)
        .get(result.lastInsertRowid) as DashboardConfigItem;
}

export function remove(tileId: number): boolean {
    const result = db
        .prepare('DELETE FROM dashboard_config WHERE id = ?')
        .run(tileId);
    return result.changes > 0;
}

export function reorder(tileIds: number[]): void {
    const update = db.prepare('UPDATE dashboard_config SET position = ? WHERE id = ?');
    const run = db.transaction((ids: number[]) => {
        ids.forEach((id, index) => update.run(index + 1, id));
    });
    run(tileIds);
}

export interface UpdateTileFields {
    account_id: number | null;
    tile_type: TileType;
    time_window: string | null;
    show_balance: boolean;
    forecast_discretionary: boolean;
}

export function updateShowBalance(tileId: number, showBalance: boolean): DashboardConfigItem | null {
    const result = db
        .prepare('UPDATE dashboard_config SET show_balance = ? WHERE id = ?')
        .run(showBalance ? 1 : 0, tileId);
    if (result.changes === 0) return null;
    return db
        .prepare(`${SELECT_SQL} WHERE dc.id = ?`)
        .get(tileId) as DashboardConfigItem;
}

export function updateTile(tileId: number, fields: UpdateTileFields): DashboardConfigItem | null {
    const result = db
        .prepare('UPDATE dashboard_config SET account_id = ?, tile_type = ?, time_window = ?, show_balance = ?, forecast_discretionary = ? WHERE id = ?')
        .run(fields.account_id, fields.tile_type, fields.time_window, fields.show_balance ? 1 : 0, fields.forecast_discretionary ? 1 : 0, tileId);
    if (result.changes === 0) return null;
    return db
        .prepare(`${SELECT_SQL} WHERE dc.id = ?`)
        .get(tileId) as DashboardConfigItem;
}
