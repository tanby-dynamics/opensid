import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NetWorthChartTile from './NetWorthChartTile';

vi.mock('../api/netWorth', () => ({
    getNetWorthHistory: vi.fn(),
}));

import * as netWorthApi from '../api/netWorth';

function renderTile(window: string) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <NetWorthChartTile window={window} />
        </QueryClientProvider>,
    );
}

describe('NetWorthChartTile', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows the selected window label', async () => {
        vi.mocked(netWorthApi.getNetWorthHistory).mockResolvedValue([]);
        renderTile('3m');

        await waitFor(() => {
            expect(screen.getByText('Last 3 months')).toBeTruthy();
        });
    });

    it('shows empty state when there is no data', async () => {
        vi.mocked(netWorthApi.getNetWorthHistory).mockResolvedValue([]);
        renderTile('30d');

        await waitFor(() => {
            expect(screen.getByText('No data for this period.')).toBeTruthy();
        });
    });

    it('renders the chart title', async () => {
        vi.mocked(netWorthApi.getNetWorthHistory).mockResolvedValue([
            { date: '2026-05-01', total_cents: 100000 },
        ]);
        renderTile('30d');

        await waitFor(() => {
            expect(screen.getByText('Net Worth Over Time')).toBeTruthy();
        });
    });
});
