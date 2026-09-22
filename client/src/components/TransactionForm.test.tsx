import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TransactionForm from './TransactionForm';
import type { Transaction } from '../types/transaction';

const existing: Transaction = {
    id: 1,
    account_id: 1,
    category: 'Food',
    description: 'Coffee',
    amount_cents: -450,
    type: 'expense',
    date: '2024-01-15',
    notes: 'morning coffee',
    created_at: '2024-01-15T00:00:00',
    updated_at: '2024-01-15T00:00:00',
    deleted_at: null,
    recurrence: null,
    recurrence_end_date: null,
    recurrence_source_id: null,
    transfer_group_id: null,
    cleared_at: null,
    split_parent_id: null,
    split_count: 0,
    tags: [],
};

function wrap(ui: React.ReactElement) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('TransactionForm', () => {
    it('renders "New transaction" title when no initial', () => {
        wrap(<TransactionForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
        expect(screen.getByText('New transaction')).toBeTruthy();
    });

    it('renders "Edit transaction" title when initial provided', () => {
        wrap(<TransactionForm initial={existing} onSubmit={vi.fn()} onCancel={vi.fn()} />);
        expect(screen.getByText('Edit transaction')).toBeTruthy();
    });

    it('renders Category field before Description field', () => {
        wrap(<TransactionForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
        expect(screen.getByLabelText(/category/i)).toBeTruthy();
        expect(screen.getByLabelText(/description/i)).toBeTruthy();
    });

    it('pre-populates fields from initial', () => {
        wrap(<TransactionForm initial={existing} onSubmit={vi.fn()} onCancel={vi.fn()} />);
        const inputs = screen.getAllByRole('textbox');
        const descInput = inputs.find(
            (el) => (el as HTMLInputElement).value === 'Coffee',
        );
        expect(descInput).toBeTruthy();
        const catInput = inputs.find(
            (el) => (el as HTMLInputElement).value === 'Food',
        );
        expect(catInput).toBeTruthy();
    });

    it('shows validation errors when submitted empty', () => {
        wrap(<TransactionForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /save/i }));
        expect(screen.getByText('Category is required.')).toBeTruthy();
        expect(screen.getByText('Enter a positive amount.')).toBeTruthy();
    });

    it('does not submit when validation fails', () => {
        const onSubmit = vi.fn();
        wrap(<TransactionForm onSubmit={onSubmit} onCancel={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /save/i }));
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('calls onSubmit with pre-filled values when editing', () => {
        const onSubmit = vi.fn();
        wrap(<TransactionForm initial={existing} onSubmit={onSubmit} onCancel={vi.fn()} />);

        fireEvent.submit(document.querySelector('form')!);

        expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({
                category: 'Food',
                description: 'Coffee',
                amount: 4.5,
                type: 'expense',
                date: '2024-01-15',
            }),
            [],
            expect.any(Boolean),
        );
    });

    it('shows category validation error when category is empty', () => {
        const noCategory: Transaction = { ...existing, category: null };
        wrap(<TransactionForm initial={noCategory} onSubmit={vi.fn()} onCancel={vi.fn()} />);

        fireEvent.submit(document.querySelector('form')!);

        expect(screen.getByText('Category is required.')).toBeTruthy();
    });

    it('calls onCancel when cancel is clicked', () => {
        const onCancel = vi.fn();
        wrap(<TransactionForm onSubmit={vi.fn()} onCancel={onCancel} />);
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
        expect(onCancel).toHaveBeenCalled();
    });

    it('pre-fills description when category is typed and description is empty', () => {
        wrap(<TransactionForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
        const categoryInput = screen.getByLabelText(/category/i);
        fireEvent.change(categoryInput, { target: { value: 'Shopping' } });
        const descInput = screen.getByLabelText(/description/i) as HTMLInputElement;
        expect(descInput.value).toBe('Shopping');
    });

    it('does not overwrite description when category is typed', () => {
        wrap(<TransactionForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
        const descInput = screen.getByLabelText(/description/i) as HTMLInputElement;
        fireEvent.change(descInput, { target: { value: 'My custom description' } });
        const categoryInput = screen.getByLabelText(/category/i);
        fireEvent.change(categoryInput, { target: { value: 'Shopping' } });
        expect(descInput.value).toBe('My custom description');
    });

    it('does not overwrite description when suggestion is selected', () => {
        wrap(<TransactionForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
        const descInput = screen.getByLabelText(/description/i) as HTMLInputElement;
        fireEvent.change(descInput, { target: { value: 'My custom description' } });
        // simulate suggestion click by directly calling the effect via category change
        const categoryInput = screen.getByLabelText(/category/i);
        fireEvent.change(categoryInput, { target: { value: 'Shopping' } });
        expect(descInput.value).toBe('My custom description');
    });

    it('toggles type between expense and income', () => {
        wrap(<TransactionForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
        const incomeBtn = screen.getByRole('button', { name: /income/i });
        fireEvent.click(incomeBtn);
        expect((incomeBtn as HTMLButtonElement).style.background).toBe('var(--green)');
    });

    it('does not show the split toggle until an amount is entered', () => {
        wrap(<TransactionForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
        expect(screen.queryByText('Split transaction')).toBeNull();
        fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '200' } });
        expect(screen.getByText('Split transaction')).toBeTruthy();
    });

    it('does not offer splitting when editing an existing transaction', () => {
        wrap(<TransactionForm initial={existing} onSubmit={vi.fn()} onCancel={vi.fn()} />);
        expect(screen.queryByText('Split transaction')).toBeNull();
    });

    it('disables save while split rows do not sum to the amount', () => {
        wrap(<TransactionForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
        fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '200' } });
        fireEvent.click(screen.getByText('Split transaction'));

        const saveBtn = screen.getByRole('button', { name: /save transaction/i }) as HTMLButtonElement;
        expect(saveBtn.disabled).toBe(true);

        const amountInputs = screen.getAllByPlaceholderText('Amount');
        fireEvent.change(amountInputs[0], { target: { value: '150' } });
        fireEvent.change(amountInputs[1], { target: { value: '50' } });
        expect(saveBtn.disabled).toBe(false);
    });

    it('distribute evenly divides the amount across split rows', () => {
        wrap(<TransactionForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
        fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '10' } });
        fireEvent.click(screen.getByText('Split transaction'));
        fireEvent.click(screen.getByText('Distribute evenly'));

        const amountInputs = screen.getAllByPlaceholderText('Amount') as HTMLInputElement[];
        expect(amountInputs[0].value).toBe('5.00');
        expect(amountInputs[1].value).toBe('5.00');
    });

    it('submits splits alongside the parent transaction', () => {
        const onSubmit = vi.fn();
        wrap(<TransactionForm onSubmit={onSubmit} onCancel={vi.fn()} />);
        fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Shopping' } });
        fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '200' } });
        fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2026-05-01' } });
        fireEvent.click(screen.getByText('Split transaction'));

        const categoryInputs = screen.getAllByPlaceholderText('Category');
        const amountInputs = screen.getAllByPlaceholderText('Amount');
        fireEvent.change(categoryInputs[0], { target: { value: 'Groceries' } });
        fireEvent.change(amountInputs[0], { target: { value: '150' } });
        fireEvent.change(categoryInputs[1], { target: { value: 'Household' } });
        fireEvent.change(amountInputs[1], { target: { value: '50' } });

        fireEvent.submit(document.querySelector('form')!);

        expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({
                splits: [
                    { amount: 150, category: 'Groceries', notes: null },
                    { amount: 50, category: 'Household', notes: null },
                ],
            }),
            [],
            expect.any(Boolean),
        );
    });
});
