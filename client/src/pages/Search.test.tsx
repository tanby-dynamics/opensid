import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Search from './Search';
import type { TransactionWithAccount } from '../api/transactions';

vi.mock('../api/transactions', async () => {
    const actual = await vi.importActual<object>('../api/transactions');
    return {
        ...actual,
        searchAllTransactions: vi.fn(),
    };
});
vi.mock('../api/categories', () => ({
    getCategories: vi.fn().mockResolvedValue(['Groceries', 'Cafés']),
}));

import * as txApi from '../api/transactions';

function makeTx(over: Partial<TransactionWithAccount>): TransactionWithAccount {
    return {
        id: 1,
        account_id: 1,
        account_name: 'Everyday',
        category: 'Groceries',
        description: 'Bunnings',
        amount_cents: -4500,
        type: 'expense',
        date: '2026-05-01',
        notes: null,
        created_at: '',
        updated_at: '',
        deleted_at: null,
        recurrence: null,
        recurrence_end_date: null,
        recurrence_source_id: null,
        transfer_group_id: null,
        cleared_at: null,
        split_parent_id: null,
        split_count: 0,
        tags: [],
        ...over,
    };
}

function renderSearch() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <MemoryRouter>
                <Search />
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

describe('Search page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(txApi.searchAllTransactions).mockResolvedValue([]);
    });

    it('does not query the API before any filter is set', () => {
        renderSearch();
        expect(txApi.searchAllTransactions).not.toHaveBeenCalled();
        expect(screen.getByText(/enter search criteria/i)).toBeTruthy();
    });

    it('debounces keyword input and calls the search API', async () => {
        renderSearch();
        const input = screen.getByPlaceholderText(/description, notes or category/i);
        fireEvent.change(input, { target: { value: 'hardware' } });

        await waitFor(() => {
            expect(txApi.searchAllTransactions).toHaveBeenCalled();
        }, { timeout: 1500 });

        const lastCall = vi.mocked(txApi.searchAllTransactions).mock.calls.at(-1)?.[0];
        expect(lastCall?.keyword).toBe('hardware');
    });

    it('groups results by account with counts', async () => {
        vi.mocked(txApi.searchAllTransactions).mockResolvedValue([
            makeTx({ id: 1, account_id: 1, account_name: 'Everyday', description: 'Bunnings hardware' }),
            makeTx({ id: 2, account_id: 1, account_name: 'Everyday', description: 'Hardware run' }),
            makeTx({ id: 3, account_id: 2, account_name: 'Savings', description: 'Hardware fund' }),
        ]);

        renderSearch();
        fireEvent.change(screen.getByPlaceholderText(/description, notes or category/i), {
            target: { value: 'hardware' },
        });

        await waitFor(() => {
            expect(screen.getByRole('link', { name: 'Everyday' })).toBeTruthy();
            expect(screen.getByRole('link', { name: 'Savings' })).toBeTruthy();
        });
        expect(screen.getByText('2 matches')).toBeTruthy();
        expect(screen.getByText('1 match')).toBeTruthy();
    });

    it('renders result rows as links with the expand query param', async () => {
        vi.mocked(txApi.searchAllTransactions).mockResolvedValue([
            makeTx({ id: 42, account_id: 7, account_name: 'Everyday', description: 'Bunnings hardware' }),
        ]);

        renderSearch();
        fireEvent.change(screen.getByPlaceholderText(/description, notes or category/i), {
            target: { value: 'hardware' },
        });

        await waitFor(() => {
            const links = screen.getAllByRole('link');
            const resultLink = links.find((l) => l.getAttribute('href') === '/accounts/7?expand=42');
            expect(resultLink).toBeTruthy();
        });
    });

    it('passes hasAttachment and recurringOnly filters to the API', async () => {
        renderSearch();
        // Set keyword to trigger query, then enable both
        fireEvent.change(screen.getByPlaceholderText(/description, notes or category/i), {
            target: { value: 'hardware' },
        });
        const attachmentSelect = screen.getByRole('option', { name: 'Has attachment' })
            .closest('select') as HTMLSelectElement;
        fireEvent.change(attachmentSelect, { target: { value: 'yes' } });
        fireEvent.click(screen.getByRole('checkbox'));

        await waitFor(() => {
            const lastCall = vi.mocked(txApi.searchAllTransactions).mock.calls.at(-1)?.[0];
            expect(lastCall?.hasAttachment).toBe('yes');
            expect(lastCall?.recurringOnly).toBe(true);
        });
    });

    it('shows "No matches" when the API returns empty results', async () => {
        vi.mocked(txApi.searchAllTransactions).mockResolvedValue([]);
        renderSearch();
        fireEvent.change(screen.getByPlaceholderText(/description, notes or category/i), {
            target: { value: 'nothingmatches' },
        });

        await waitFor(() => {
            expect(screen.getByText(/no matches/i)).toBeTruthy();
        });
    });
});
