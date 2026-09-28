import type { DashboardConfigItem, TileType } from '../api/dashboardConfig';
import { formatChartWindow, FORECAST_WINDOW_OPTIONS } from './chartWindow';

const TILE_TYPE_LABELS: Record<TileType, string> = {
    transactions: 'Transactions',
    balance_over_time: 'Balance over time',
    totals_by_category: 'Totals by category',
    income_vs_expense: 'Income vs Expense',
    budget_progress: 'Budget Progress',
    net_worth: 'Net Worth',
    net_worth_chart: 'Net Worth Over Time',
    forecast: 'Forecast',
};

function forecastWindowLabel(timeWindow: string): string {
    const match = FORECAST_WINDOW_OPTIONS.find((o) => o.value === timeWindow);
    return match?.label ?? timeWindow;
}

function windowLabel(item: Pick<DashboardConfigItem, 'tile_type'>, w: string): string {
    return item.tile_type === 'forecast' ? forecastWindowLabel(w) : formatChartWindow(w);
}

export type TitleFormat = 'terse' | 'descriptive';

// Terse mirrors what appears on the dashboard tile itself (kept unchanged by this feature);
// descriptive mirrors the settings-list format, which disambiguates same-account tiles.
export function generatedTileTitle(item: Pick<DashboardConfigItem, 'account_id' | 'tile_type' | 'time_window'>, accountName: string, format: TitleFormat): string {
    if (format === 'terse') {
        return item.account_id === null ? TILE_TYPE_LABELS[item.tile_type] : accountName;
    }

    if (item.account_id === null) {
        const base = TILE_TYPE_LABELS[item.tile_type];
        return item.time_window ? `${base} — ${windowLabel(item, item.time_window)}` : base;
    }
    if (item.tile_type === 'transactions') return accountName;
    const base = `${accountName} — ${TILE_TYPE_LABELS[item.tile_type]}`;
    return item.time_window ? `${base} — ${windowLabel(item, item.time_window)}` : base;
}

export function resolveTileTitle(item: DashboardConfigItem, accountName: string, format: TitleFormat): string {
    return item.title ?? generatedTileTitle(item, accountName, format);
}
