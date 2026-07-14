import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ForecastTile from './ForecastTile';

vi.mock('../api/forecast', () => ({
    getForecast: vi.fn(),
}));

import * as forecastApi from '../api/forecast';

function renderTile(days = 30, includeDiscretionary = false) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <MemoryRouter>
                <ForecastTile accountId={1} accountName="Everyday" days={days} includeDiscretionary={includeDiscretionary} />
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

describe('ForecastTile', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows closing balance, lowest, and stays-positive state', async () => {
        vi.mocked(forecastApi.getForecast).mockResolvedValue({
            starting_balance_cents: 250000,
            window_days: 30,
            include_discretionary: false,
            discretionary_per_day_cents: 0,
            closing_balance_cents: 70000,
            lowest_balance_cents: 70000,
            lowest_balance_date: '2026-06-24',
            zero_crossing_date: null,
            events: [{ date: '2026-06-01', label: 'Rent', amount_cents: -180000, kind: 'recurring' }],
            daily: [{ date: '2026-06-01', balance_cents: 70000 }],
        });

        renderTile();

        await waitFor(() => {
            expect(screen.getAllByText('+$700.00').length).toBeGreaterThan(0);
        });
        expect(screen.getByText('Stays positive')).toBeTruthy();
    });

    it('shows zero-crossing date in place of "stays positive"', async () => {
        vi.mocked(forecastApi.getForecast).mockResolvedValue({
            starting_balance_cents: 50000,
            window_days: 30,
            include_discretionary: false,
            discretionary_per_day_cents: 0,
            closing_balance_cents: -20000,
            lowest_balance_cents: -20000,
            lowest_balance_date: '2026-07-07',
            zero_crossing_date: '2026-07-07',
            events: [],
            daily: [{ date: '2026-07-07', balance_cents: -20000 }],
        });

        renderTile();

        await waitFor(() => {
            expect(screen.queryByText('Stays positive')).toBeNull();
        });
    });

    it('shows the discretionary caveat only when enabled', async () => {
        vi.mocked(forecastApi.getForecast).mockResolvedValue({
            starting_balance_cents: 100000,
            window_days: 30,
            include_discretionary: true,
            discretionary_per_day_cents: 4000,
            closing_balance_cents: 90000,
            lowest_balance_cents: 90000,
            lowest_balance_date: '2026-06-24',
            zero_crossing_date: null,
            events: [],
            daily: [{ date: '2026-06-01', balance_cents: 90000 }],
        });

        renderTile(30, true);

        await waitFor(() => {
            expect(screen.getByText(/discretionary estimate/)).toBeTruthy();
        });
    });

    it('toggles the events list', async () => {
        vi.mocked(forecastApi.getForecast).mockResolvedValue({
            starting_balance_cents: 250000,
            window_days: 30,
            include_discretionary: false,
            discretionary_per_day_cents: 0,
            closing_balance_cents: 70000,
            lowest_balance_cents: 70000,
            lowest_balance_date: '2026-06-24',
            zero_crossing_date: null,
            events: [{ date: '2026-06-01', label: 'Rent', amount_cents: -180000, kind: 'recurring' }],
            daily: [{ date: '2026-06-01', balance_cents: 70000 }],
        });

        renderTile();

        await waitFor(() => expect(screen.getByText('Show events (1)')).toBeTruthy());
        expect(screen.queryByText(/Rent/)).toBeNull();

        fireEvent.click(screen.getByText('Show events (1)'));
        expect(screen.getByText(/Rent/)).toBeTruthy();
    });
});
