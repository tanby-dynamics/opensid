import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import BalanceChartTile from './BalanceChartTile';

vi.mock('../api/charts', () => ({
    getBalanceChart: vi.fn(),
}));

import * as chartsApi from '../api/charts';

function renderTile(
    window: string,
    showBalance = false,
    balanceCents: number | null = null,
    savedViewId: number | null = null,
) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    return render(
        <QueryClientProvider client={client}>
            <MemoryRouter>
                <BalanceChartTile
                    accountId={1}
                    accountName="Savings"
                    window={window}
                    showBalance={showBalance}
                    balanceCents={balanceCents}
                    savedViewId={savedViewId}
                />
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

describe('BalanceChartTile', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(chartsApi.getBalanceChart).mockResolvedValue([]);
    });

    it('shows the selected preset duration', async () => {
        renderTile('3m');

        await waitFor(() => {
            expect(screen.getByText('Last 3 months')).toBeTruthy();
        });
    });

    it('shows a readable label for custom week durations', async () => {
        renderTile('6w');

        await waitFor(() => {
            expect(screen.getByText('Last 6 weeks')).toBeTruthy();
        });
    });

    it('does not show balance when showBalance is false', async () => {
        renderTile('3m', false, 50000);

        await waitFor(() => {
            expect(screen.queryByText('+$500.00')).toBeNull();
        });
    });

    it('shows balance when showBalance is true and balanceCents is set', async () => {
        renderTile('3m', true, 50000);

        await waitFor(() => {
            expect(screen.getByText('+$500.00')).toBeTruthy();
        });
    });

    it('does not show balance when showBalance is true but balanceCents is null', async () => {
        renderTile('3m', true, null);

        await waitFor(() => {
            expect(screen.queryByText(/\$/)).toBeNull();
        });
    });
});
