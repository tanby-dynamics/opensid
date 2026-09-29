import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import type { DashboardConfigItem } from '../api/dashboardConfig';
import type { DashboardTransactionsTile } from '../types/dashboard';

vi.mock('../api/dashboard', () => ({ getDashboard: vi.fn() }));
vi.mock('../api/dashboardConfig', async () => {
    const actual = await vi.importActual<object>('../api/dashboardConfig');
    return { ...actual, getDashboardConfig: vi.fn() };
});
vi.mock('../api/accounts', async () => {
    const actual = await vi.importActual<object>('../api/accounts');
    return { ...actual, listAccountsWithBalances: vi.fn().mockResolvedValue([]) };
});

import * as dashboardApi from '../api/dashboard';
import * as dashboardConfigApi from '../api/dashboardConfig';

function makeConfig(over: Partial<DashboardConfigItem>): DashboardConfigItem {
    return {
        id: 1,
        account_id: 10,
        position: 1,
        tile_type: 'transactions',
        time_window: null,
        show_balance: true,
        forecast_discretionary: false,
        saved_view_id: null,
        title: null,
        balance_cents: null,
        ...over,
    };
}

function makeTile(over: Partial<DashboardTransactionsTile>): DashboardTransactionsTile {
    return {
        tile_id: 1,
        account_id: 10,
        name: 'Everyday',
        balance_cents: 0,
        recent_transactions: [],
        ...over,
    };
}

function renderDashboard() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <MemoryRouter>
                <Dashboard />
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

describe('Dashboard', () => {
    it('shows each transactions tile for the same account with its own balance', async () => {
        vi.mocked(dashboardConfigApi.getDashboardConfig).mockResolvedValue([
            makeConfig({ id: 1, position: 1, title: 'All activity' }),
            makeConfig({ id: 2, position: 2, title: 'Expenses only' }),
        ]);
        vi.mocked(dashboardApi.getDashboard).mockResolvedValue([
            makeTile({ tile_id: 1, balance_cents: 95000 }),
            makeTile({ tile_id: 2, balance_cents: -5000 }),
        ]);

        renderDashboard();

        expect(await screen.findByText('All activity')).toBeTruthy();
        expect(screen.getByText('Expenses only')).toBeTruthy();
        expect(screen.getByText('+$950.00')).toBeTruthy();
        expect(screen.getByText('−$50.00')).toBeTruthy();
    });
});
