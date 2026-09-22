import { useMemo, useState } from 'react';
import type { PreviewAction, PreviewPayload, PreviewRow } from '../api/transactions';

interface Props {
    preview: PreviewPayload;
    isCommitting: boolean;
    onCommit: (rows: PreviewRow[]) => void;
    onCancel: () => void;
}

function formatAmount(amountCents: number): string {
    return (Math.abs(amountCents) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const CHIP_BASE = 'inline-block px-2 py-[3px] rounded-full text-[11px] font-bold whitespace-nowrap';

function StatusChip({ row }: { row: PreviewRow }) {
    if (row.duplicate_of !== null) {
        return <span className={`${CHIP_BASE} bg-[var(--red-light)] text-[var(--red)]`}>Duplicate</span>;
    }
    if (row.duplicate_within_batch) {
        return <span className={`${CHIP_BASE} bg-[#fdf0d5] text-[#9a6700]`}>Duplicate in batch</span>;
    }
    return null;
}

export default function ImportPreviewDialog({ preview, isCommitting, onCommit, onCancel }: Props) {
    const [rows, setRows] = useState<PreviewRow[]>(preview.rows);

    const counts = useMemo(() => {
        let importing = 0;
        let skipping = 0;
        let updating = 0;
        for (const row of rows) {
            if (row.action === 'import') importing++;
            else if (row.action === 'skip') skipping++;
            else updating++;
        }
        return { importing, skipping, updating };
    }, [rows]);

    function updateRow(index: number, patch: Partial<PreviewRow>) {
        setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    }

    function skipAllDuplicates() {
        setRows((prev) =>
            prev.map((row) => (row.duplicate_of !== null || row.duplicate_within_batch ? { ...row, action: 'skip' } : row)),
        );
    }

    function importAll() {
        setRows((prev) => prev.map((row) => ({ ...row, action: 'import' })));
    }

    function applySuggestedCategories() {
        setRows((prev) =>
            prev.map((row) => (row.suggested_category ? { ...row, category: row.suggested_category } : row)),
        );
    }

    return (
        <div className="opensid-modal-overlay anim-fade">
            <div className="opensid-modal anim-slide-up" style={{ maxWidth: 1080 }}>
                <div className="opensid-modal-trim" />
                <div className="opensid-modal-body">
                    <h2 className="font-display text-lg font-bold text-[var(--teak-dark)] mb-1">Smart import preview</h2>
                    <p className="text-sm text-[var(--text-secondary)] mb-4">
                        {preview.summary.total} row{preview.summary.total !== 1 ? 's' : ''} ·{' '}
                        {preview.summary.duplicates} duplicate{preview.summary.duplicates !== 1 ? 's' : ''} flagged ·{' '}
                        {preview.summary.categorised} categorised by suggestion
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                        <span className="text-[13px] font-body text-[var(--text-secondary)]">
                            Importing {counts.importing} · Skipping {counts.skipping} · Updating {counts.updating}
                        </span>
                        <div className="flex flex-wrap gap-2">
                            <button className="opensid-btn opensid-btn-ghost opensid-btn-sm" onClick={skipAllDuplicates}>
                                Skip all duplicates
                            </button>
                            <button className="opensid-btn opensid-btn-ghost opensid-btn-sm" onClick={importAll}>
                                Import all
                            </button>
                            <button className="opensid-btn opensid-btn-ghost opensid-btn-sm" onClick={applySuggestedCategories}>
                                Apply suggested categories
                            </button>
                        </div>
                    </div>

                    <div className="overflow-x-auto max-h-[55vh] overflow-y-auto rounded-xl [border:1.5px_solid_var(--border)]">
                        <table className="w-full text-[13px] font-body">
                            <thead className="sticky top-0 bg-[var(--cream)] text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                                <tr>
                                    <th className="text-left px-3 py-2">Date</th>
                                    <th className="text-left px-3 py-2">Description</th>
                                    <th className="text-right px-3 py-2">Amount</th>
                                    <th className="text-left px-3 py-2">Type</th>
                                    <th className="text-left px-3 py-2">Category</th>
                                    <th className="text-left px-3 py-2">Status</th>
                                    <th className="text-left px-3 py-2">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, i) => (
                                    <tr key={row.row_index} className="border-t border-[var(--border)]">
                                        <td className="px-3 py-2 whitespace-nowrap">{row.date}</td>
                                        <td className="px-3 py-2 min-w-[180px]">
                                            <input
                                                className="opensid-input !py-[6px] !text-[13px] w-full"
                                                value={row.description}
                                                onChange={(e) => updateRow(i, { description: e.target.value })}
                                            />
                                        </td>
                                        <td className="px-3 py-2 text-right whitespace-nowrap">
                                            {row.type === 'expense' ? '-' : ''}${formatAmount(row.amount_cents)}
                                        </td>
                                        <td className="px-3 py-2 capitalize">{row.type}</td>
                                        <td className="px-3 py-2 min-w-[160px]">
                                            <input
                                                className="opensid-input !py-[6px] !text-[13px] w-full"
                                                value={row.category ?? ''}
                                                placeholder={row.suggested_category ?? ''}
                                                onChange={(e) => updateRow(i, { category: e.target.value })}
                                            />
                                            {row.suggested_category && row.suggested_category !== row.category && (
                                                <button
                                                    type="button"
                                                    className="block mt-1 text-[11px] text-[var(--teak)] hover:underline"
                                                    onClick={() => updateRow(i, { category: row.suggested_category })}
                                                >
                                                    Use suggestion: {row.suggested_category}
                                                </button>
                                            )}
                                        </td>
                                        <td className="px-3 py-2"><StatusChip row={row} /></td>
                                        <td className="px-3 py-2">
                                            <select
                                                className="opensid-input !py-[6px] !text-[13px]"
                                                value={row.action}
                                                onChange={(e) => updateRow(i, { action: e.target.value as PreviewAction })}
                                            >
                                                <option value="import">Import</option>
                                                <option value="skip">Skip</option>
                                                {row.duplicate_of !== null && (
                                                    <option value="update_existing">Update existing</option>
                                                )}
                                            </select>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex justify-end gap-2.5 mt-5">
                        <button className="opensid-btn opensid-btn-ghost" onClick={onCancel} disabled={isCommitting}>
                            Cancel
                        </button>
                        <button
                            className="opensid-btn opensid-btn-primary"
                            onClick={() => onCommit(rows)}
                            disabled={isCommitting}
                        >
                            {isCommitting ? 'Importing…' : 'Confirm import'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
