import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NetWorthTile from './NetWorthTile';

vi.mock('../api/netWorth', () => ({
    getNetWorth: vi.fn(),
    getNetWorthHistory: vi.fn(),
}));

import * as netWorthApi from '../api/netWorth';

function renderTile() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <NetWorthTile />
        </QueryClientProvider>,
    );
}

describe('NetWorthTile', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(netWorthApi.getNetWorthHistory).mockResolvedValue([]);
    });

    it('shows the headline total, assets, and liabilities', async () => {
        vi.mocked(netWorthApi.getNetWorth).mockResolvedValue({
            as_of: '2026-05-28',
            total_cents: 550000,
            assets_cents: 600000,
            liabilities_cents: 50000,
            accounts: [
                { id: 1, name: 'Everyday', kind: 'asset', balance_cents: 100000 },
                { id: 2, name: 'Savings', kind: 'asset', balance_cents: 500000 },
                { id: 3, name: 'Visa', kind: 'liability', balance_cents: -50000 },
            ],
        });

        renderTile();

        await waitFor(() => {
            expect(screen.getByText('+$5,500.00')).toBeTruthy();
        });
        expect(screen.getByText('+$6,000.00')).toBeTruthy();
    });

    it('shows breakdown rows only after toggling', async () => {
        vi.mocked(netWorthApi.getNetWorth).mockResolvedValue({
            as_of: '2026-05-28',
            total_cents: 100000,
            assets_cents: 100000,
            liabilities_cents: 0,
            accounts: [{ id: 1, name: 'Everyday', kind: 'asset', balance_cents: 100000 }],
        });

        renderTile();

        await waitFor(() => expect(screen.getByText('Show breakdown')).toBeTruthy());
        expect(screen.queryByText('Everyday')).toBeNull();

        fireEvent.click(screen.getByText('Show breakdown'));
        expect(screen.getByText('Everyday')).toBeTruthy();
    });

    it('shows trend pill based on history', async () => {
        vi.mocked(netWorthApi.getNetWorth).mockResolvedValue({
            as_of: '2026-05-28',
            total_cents: 550000,
            assets_cents: 550000,
            liabilities_cents: 0,
            accounts: [],
        });
        vi.mocked(netWorthApi.getNetWorthHistory).mockResolvedValue([
            { date: '2026-04-28', total_cents: 500000 },
            { date: '2026-05-28', total_cents: 550000 },
        ]);

        renderTile();

        await waitFor(() => {
            expect(screen.getByText(/vs 30 days ago/)).toBeTruthy();
        });
    });
});
