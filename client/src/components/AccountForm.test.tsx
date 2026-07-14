import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AccountForm from './AccountForm';

describe('AccountForm', () => {
    it('renders the title', () => {
        render(<AccountForm title="New account" onSubmit={vi.fn()} onCancel={vi.fn()} />);
        expect(screen.getByText('New account')).toBeTruthy();
    });

    it('pre-fills name when initialName is provided', () => {
        render(
            <AccountForm
                title="Rename account"
                initialName="Office"
                onSubmit={vi.fn()}
                onCancel={vi.fn()}
            />,
        );
        expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Office');
    });

    it('calls onSubmit with trimmed name on submit', () => {
        const onSubmit = vi.fn();
        render(<AccountForm title="New account" onSubmit={onSubmit} onCancel={vi.fn()} />);
        fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Training  ' } });
        fireEvent.click(screen.getByRole('button', { name: /save/i }));
        expect(onSubmit).toHaveBeenCalledWith({ name: 'Training', kind: 'asset', excludeFromNetWorth: false });
    });

    it('shows error and does not submit when name is empty', () => {
        const onSubmit = vi.fn();
        render(<AccountForm title="New account" onSubmit={onSubmit} onCancel={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /save/i }));
        expect(onSubmit).not.toHaveBeenCalled();
        expect(screen.getByText('Name is required.')).toBeTruthy();
    });

    it('submits selected kind and exclude_from_net_worth', () => {
        const onSubmit = vi.fn();
        render(<AccountForm title="New account" onSubmit={onSubmit} onCancel={vi.fn()} />);
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Visa' } });
        fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'liability' } });
        fireEvent.click(screen.getByLabelText(/exclude from net worth/i));
        fireEvent.click(screen.getByRole('button', { name: /save/i }));
        expect(onSubmit).toHaveBeenCalledWith({ name: 'Visa', kind: 'liability', excludeFromNetWorth: true });
    });

    it('pre-fills kind and exclude_from_net_worth from initial values', () => {
        render(
            <AccountForm
                title="Rename account"
                initialName="Play money"
                initialKind="liability"
                initialExcludeFromNetWorth={true}
                onSubmit={vi.fn()}
                onCancel={vi.fn()}
            />,
        );
        expect((screen.getByLabelText('Kind') as HTMLSelectElement).value).toBe('liability');
        expect((screen.getByLabelText(/exclude from net worth/i) as HTMLInputElement).checked).toBe(true);
    });

    it('calls onCancel when cancel is clicked', () => {
        const onCancel = vi.fn();
        render(<AccountForm title="New account" onSubmit={vi.fn()} onCancel={onCancel} />);
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
        expect(onCancel).toHaveBeenCalled();
    });

    it('displays serverError when provided', () => {
        render(
            <AccountForm
                title="New account"
                onSubmit={vi.fn()}
                onCancel={vi.fn()}
                serverError="An account with this name already exists."
            />,
        );
        expect(screen.getByText('An account with this name already exists.')).toBeTruthy();
    });
});
