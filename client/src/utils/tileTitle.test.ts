import { describe, it, expect } from 'vitest';
import { resolveTileTitle, generatedTileTitle } from './tileTitle';
import type { DashboardConfigItem } from '../api/dashboardConfig';

function makeTile(overrides: Partial<DashboardConfigItem> = {}): DashboardConfigItem {
    return {
        id: 1,
        account_id: 10,
        position: 1,
        tile_type: 'transactions',
        time_window: null,
        show_balance: false,
        forecast_discretionary: false,
        saved_view_id: null,
        title: null,
        balance_cents: null,
        ...overrides,
    };
}

describe('generatedTileTitle', () => {
    it('terse format is just the account name for account-scoped tiles', () => {
        expect(generatedTileTitle(makeTile({ tile_type: 'balance_over_time', time_window: '30d' }), 'Savings', 'terse')).toBe('Savings');
    });

    it('descriptive format includes tile type and time window for account-scoped tiles', () => {
        const tile = makeTile({ tile_type: 'balance_over_time', time_window: '30d' });
        expect(generatedTileTitle(tile, 'Savings', 'descriptive')).toBe('Savings — Balance over time — Last 30 days');
    });

    it('descriptive format for transactions tile is just the account name', () => {
        expect(generatedTileTitle(makeTile({ tile_type: 'transactions' }), 'Savings', 'descriptive')).toBe('Savings');
    });

    it('terse format for a cross-account tile uses the tile type label, ignoring accountName', () => {
        const tile = makeTile({ account_id: null, tile_type: 'net_worth' });
        expect(generatedTileTitle(tile, 'irrelevant', 'terse')).toBe('Net Worth');
    });

    it('descriptive format for a cross-account chart tile includes the time window', () => {
        const tile = makeTile({ account_id: null, tile_type: 'net_worth_chart', time_window: '3m' });
        expect(generatedTileTitle(tile, 'irrelevant', 'descriptive')).toBe('Net Worth Over Time — Last 3 months');
    });

    it('uses forecast window labels for forecast tiles', () => {
        const tile = makeTile({ tile_type: 'forecast', time_window: '60d' });
        expect(generatedTileTitle(tile, 'Everyday', 'descriptive')).toBe('Everyday — Forecast — Next 60 days');
    });
});

describe('resolveTileTitle', () => {
    it('returns the custom title verbatim when set, regardless of format', () => {
        const tile = makeTile({ tile_type: 'balance_over_time', time_window: '30d', title: 'Rainy Day Fund' });
        expect(resolveTileTitle(tile, 'Savings', 'terse')).toBe('Rainy Day Fund');
        expect(resolveTileTitle(tile, 'Savings', 'descriptive')).toBe('Rainy Day Fund');
    });

    it('falls back to the generated title when no custom title is set', () => {
        const tile = makeTile({ tile_type: 'transactions', title: null });
        expect(resolveTileTitle(tile, 'Savings', 'terse')).toBe('Savings');
    });
});
