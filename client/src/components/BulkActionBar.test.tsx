import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BulkActionBar from './BulkActionBar';

describe('BulkActionBar', () => {
    it('renders nothing when no rows are selected', () => {
        const { container } = render(
            <BulkActionBar selectedCount={0} onDelete={vi.fn()} onExport={vi.fn()} onClear={vi.fn()} />,
        );
        expect(container.firstChild).toBeNull();
    });

    it('does not show Unsplit when the selection is not a split parent', () => {
        render(
            <BulkActionBar selectedCount={1} onDelete={vi.fn()} onExport={vi.fn()} onClear={vi.fn()} canUnsplit={false} onUnsplit={vi.fn()} />,
        );
        expect(screen.queryByText('Unsplit')).toBeNull();
    });

    it('shows Unsplit and calls the handler when clicked', () => {
        const onUnsplit = vi.fn();
        render(
            <BulkActionBar selectedCount={1} onDelete={vi.fn()} onExport={vi.fn()} onClear={vi.fn()} canUnsplit={true} onUnsplit={onUnsplit} />,
        );
        fireEvent.click(screen.getByText('Unsplit'));
        expect(onUnsplit).toHaveBeenCalled();
    });
});
