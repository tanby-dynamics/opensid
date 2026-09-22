import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Transaction, RecurrenceFrequency, TagRef } from '../types/transaction';
import type { AccountWithBalance } from '../types/account';
import type { SplitRowPayload } from '../api/transactions';
import { getCategories } from '../api/categories';
import AttachmentManager from './AttachmentManager';
import ConfirmDialog from './ConfirmDialog';
import TagPicker from './TagPicker';
import { formatDateTime } from '../utils/format';

interface TransactionData {
    category: string;
    description?: string;
    amount: number;
    type: 'income' | 'expense';
    date: string;
    notes: string | null;
    recurrence?: RecurrenceFrequency | null;
    recurrence_end_date?: string | null;
    account_id?: number;
    tag_ids?: number[];
    splits?: SplitRowPayload[];
}

interface SplitRow {
    amount: string;
    category: string;
    notes: string;
}

function newSplitRow(): SplitRow {
    return { amount: '', category: '', notes: '' };
}

interface Props {
    initial?: Transaction;
    accounts?: AccountWithBalance[];
    initialAccountId?: number;
    onSubmit: (data: TransactionData, pendingFiles: File[], addAnother: boolean) => void;
    onCancel: () => void;
}

interface FormErrors {
    account?: string;
    category?: string;
    amount?: string;
    date?: string;
    recurrence_end_date?: string;
}

const RECURRENCE_OPTIONS: { value: RecurrenceFrequency; label: string }[] = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'fortnightly', label: 'Fortnightly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'yearly', label: 'Yearly' },
];

function centsToDisplay(cents: number): string {
    return (Math.abs(cents) / 100).toFixed(2);
}

export default function TransactionForm({ initial, accounts, initialAccountId, onSubmit, onCancel }: Props) {
    const isGenerated = !!initial?.recurrence_source_id;
    const [selectedAccountId, setSelectedAccountId] = useState<string>(initialAccountId ? String(initialAccountId) : '');
    const initialType = initial?.type === 'transfer' ? 'expense' : (initial?.type ?? 'expense');
    const [type, setType] = useState<'income' | 'expense'>(initialType);
    const [category, setCategory] = useState(initial?.category ?? '');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [description, setDescription] = useState(initial?.description ?? '');
    const [descriptionTouched, setDescriptionTouched] = useState(!!(initial?.description));
    const [amount, setAmount] = useState(initial ? centsToDisplay(initial.amount_cents) : '');
    const [date, setDate] = useState(initial?.date ?? new Date().toISOString().split('T')[0]);
    const [notes, setNotes] = useState(initial?.notes ?? '');
    const [repeat, setRepeat] = useState(!!initial?.recurrence);
    const [recurrence, setRecurrence] = useState<RecurrenceFrequency>(initial?.recurrence ?? 'monthly');
    const [recurrenceEndDate, setRecurrenceEndDate] = useState(initial?.recurrence_end_date ?? '');
    const [selectedTags, setSelectedTags] = useState<TagRef[]>(initial?.tags ?? []);
    const [errors, setErrors] = useState<FormErrors>({});
    const [splitError, setSplitError] = useState('');
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
    const [addAnother, setAddAnother] = useState(() => localStorage.getItem('opensid:addAnotherTransaction') === 'true');
    const [splitEnabled, setSplitEnabled] = useState(false);
    const [splitRows, setSplitRows] = useState<SplitRow[]>([newSplitRow(), newSplitRow()]);
    const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const canSplit = !initial;
    const parsedAmount = parseFloat(amount);
    const splitRowsTotal = splitRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    const splitRemaining = !isNaN(parsedAmount) ? Math.round((parsedAmount - splitRowsTotal) * 100) / 100 : 0;

    function updateSplitRow(index: number, field: keyof SplitRow, value: string) {
        setSplitRows((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
        setSplitError('');
    }

    function addSplitRow() {
        setSplitRows((rows) => [...rows, newSplitRow()]);
    }

    function removeSplitRow(index: number) {
        setSplitRows((rows) => (rows.length <= 2 ? rows : rows.filter((_, i) => i !== index)));
    }

    function distributeEvenly() {
        if (isNaN(parsedAmount) || parsedAmount <= 0 || splitRows.length === 0) return;
        const totalCents = Math.round(parsedAmount * 100);
        const baseShare = Math.floor(totalCents / splitRows.length);
        const remainder = totalCents - baseShare * splitRows.length;
        setSplitRows((rows) =>
            rows.map((r, i) => ({
                ...r,
                amount: ((baseShare + (i === rows.length - 1 ? remainder : 0)) / 100).toFixed(2),
            })),
        );
        setSplitError('');
    }

    const today = new Date().toISOString().split('T')[0];
    const isDirty = initial
        ? (type !== initial.type ||
           category !== (initial.category ?? '') ||
           description !== initial.description ||
           amount !== centsToDisplay(initial.amount_cents) ||
           date !== initial.date ||
           notes !== (initial.notes ?? '') ||
           repeat !== !!initial.recurrence ||
           recurrence !== (initial.recurrence ?? 'monthly') ||
           recurrenceEndDate !== (initial.recurrence_end_date ?? '') ||
           pendingFiles.length > 0)
        : (type !== 'expense' ||
           category !== '' ||
           description !== '' ||
           amount !== '' ||
           date !== today ||
           notes !== '' ||
           repeat ||
           pendingFiles.length > 0);

    const { data: allCategories = [] } = useQuery({
        queryKey: ['categories'],
        queryFn: getCategories,
    });

    const suggestions = category.trim()
        ? allCategories.filter((c) => c.toLowerCase().includes(category.toLowerCase()))
        : allCategories;

    function handleCancel() {
        if (isDirty) {
            setShowDiscardConfirm(true);
        } else {
            onCancel();
        }
    }

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') handleCancel(); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isDirty]);

    function handleCategoryBlur() {
        blurTimerRef.current = setTimeout(() => setShowSuggestions(false), 100);
    }

    function handleSuggestionClick(value: string) {
        if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
        setCategory(value);
        setShowSuggestions(false);
        setErrors((p) => ({ ...p, category: undefined }));
    }

    function validate(): boolean {
        const next: FormErrors = {};
        if (accounts && !selectedAccountId) next.account = 'Please select an account.';
        if (!category.trim()) next.category = 'Category is required.';
        const parsed = parseFloat(amount);
        if (!amount || isNaN(parsed) || parsed <= 0) next.amount = 'Enter a positive amount.';
        if (!date) next.date = 'Date is required.';
        if (repeat && recurrenceEndDate) {
            if (recurrenceEndDate <= date) next.recurrence_end_date = 'End date must be after the transaction date.';
            else if (recurrenceEndDate <= today) next.recurrence_end_date = 'End date must be in the future.';
        }
        setErrors(next);

        let splitOk = true;
        if (splitEnabled && Object.keys(next).length === 0) {
            if (splitRows.length < 2) {
                setSplitError('A split needs at least 2 parts.');
                splitOk = false;
            } else if (splitRows.some((r) => !r.category.trim())) {
                setSplitError('Every split needs a category.');
                splitOk = false;
            } else if (splitRows.some((r) => !r.amount || isNaN(parseFloat(r.amount)) || parseFloat(r.amount) <= 0)) {
                setSplitError('Every split needs an amount greater than zero.');
                splitOk = false;
            } else if (splitRemaining !== 0) {
                setSplitError(`Splits must sum to $${parsedAmount.toFixed(2)} (remaining $${splitRemaining.toFixed(2)}).`);
                splitOk = false;
            } else {
                setSplitError('');
            }
        } else if (!splitEnabled) {
            setSplitError('');
        }

        return Object.keys(next).length === 0 && splitOk;
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!validate()) return;
        onSubmit(
            {
                category: category.trim(),
                description: description.trim() || undefined,
                amount: parseFloat(amount),
                type,
                date,
                notes: notes.trim() || null,
                recurrence: repeat ? recurrence : null,
                recurrence_end_date: repeat && recurrenceEndDate ? recurrenceEndDate : null,
                tag_ids: selectedTags.map((t) => t.id),
                ...(accounts && selectedAccountId ? { account_id: parseInt(selectedAccountId) } : {}),
                ...(splitEnabled
                    ? { splits: splitRows.map((r) => ({ amount: parseFloat(r.amount), category: r.category.trim(), notes: r.notes.trim() || null })) }
                    : {}),
            },
            pendingFiles,
            addAnother,
        );
    }

    return (
        <>
        <div className="opensid-modal-overlay anim-fade" onMouseDown={(e) => { if (e.target === e.currentTarget) handleCancel(); }}>
            <div className="opensid-modal anim-slide-up" style={{ maxWidth: '460px' }}>
                <div className="opensid-modal-trim" />
                <div className="opensid-modal-body">
                    <h2 className="opensid-modal-title">
                        {initial ? 'Edit transaction' : 'New transaction'}
                    </h2>
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        {/* Account selector — only shown when opened from dashboard */}
                        {accounts && (
                            <div className="flex flex-col gap-[5px]">
                                <label className="opensid-label">Account</label>
                                <select
                                    className="opensid-input"
                                    value={selectedAccountId}
                                    onChange={(e) => { setSelectedAccountId(e.target.value); setErrors((p) => ({ ...p, account: undefined })); }}
                                >
                                    <option value="">Select account…</option>
                                    {accounts.map((a) => (
                                        <option key={a.id} value={String(a.id)}>{a.name}</option>
                                    ))}
                                </select>
                                {errors.account && <span className="text-xs text-[var(--red)]">{errors.account}</span>}
                            </div>
                        )}

                        {/* Type toggle */}
                        <div className="flex rounded-[var(--radius-input)] overflow-hidden [border:1.5px_solid_var(--border)] bg-[var(--cream)]">
                            {(['expense', 'income'] as const).map((t) => (
                                <button key={t} type="button" onClick={() => setType(t)}
                                    className="flex-1 p-[9px] border-none cursor-pointer font-body font-bold text-[13px] transition-all duration-150"
                                    style={{
                                        background: type === t ? (t === 'expense' ? 'var(--red)' : 'var(--green)') : 'transparent',
                                        color: type === t ? '#fff' : 'var(--text-secondary)',
                                    }}>
                                    {t.charAt(0).toUpperCase() + t.slice(1)}
                                </button>
                            ))}
                        </div>

                        {/* Category */}
                        <div className="relative">
                            <div className="flex flex-col gap-[5px]">
                                <label htmlFor="category" className="opensid-label">Category</label>
                                <input
                                    id="category"
                                    type="text"
                                    autoComplete="off"
                                    className="opensid-input"
                                    placeholder="e.g. Shopping"
                                    value={category}
                                    onChange={(e) => { const v = e.target.value; setCategory(v); if (!descriptionTouched) setDescription(v); setShowSuggestions(true); setErrors((p) => ({ ...p, category: undefined })); }}
                                    onFocus={() => setShowSuggestions(true)}
                                    onBlur={handleCategoryBlur}
                                    onKeyDown={(e) => { if (e.key === 'Escape') setShowSuggestions(false); }}
                                />
                                {errors.category && <span className="text-xs text-[var(--red)]">{errors.category}</span>}
                            </div>
                            {showSuggestions && suggestions.length > 0 && (
                                <ul className="opensid-suggestions">
                                    {suggestions.map((c) => (
                                        <li key={c}>
                                            <button type="button" onMouseDown={() => handleSuggestionClick(c)} className="opensid-suggestion-item">
                                                {c}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* Tags */}
                        <TagPicker selectedTags={selectedTags} onChange={setSelectedTags} />

                        {/* Description */}
                        <div className="flex flex-col gap-[5px]">
                            <label htmlFor="description" className="opensid-label">Description (optional)</label>
                            <input
                                id="description"
                                type="text"
                                className="opensid-input"
                                placeholder="Defaults to category if left blank"
                                value={description}
                                onChange={(e) => { setDescriptionTouched(true); setDescription(e.target.value); }}
                            />
                        </div>

                        {/* Amount */}
                        <div className="flex flex-col gap-[5px]">
                            <label htmlFor="amount" className="opensid-label">Amount</label>
                            <input
                                id="amount"
                                type="number"
                                min="0.01"
                                step="0.01"
                                className="opensid-input"
                                value={amount}
                                onChange={(e) => { setAmount(e.target.value); setErrors((p) => ({ ...p, amount: undefined })); }}
                            />
                            {errors.amount && <span className="text-xs text-[var(--red)]">{errors.amount}</span>}
                        </div>

                        {/* Split */}
                        {canSplit && amount.trim() !== '' && !isNaN(parsedAmount) && parsedAmount > 0 && (
                            <div className="flex flex-col gap-3">
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={splitEnabled}
                                        onChange={(e) => { setSplitEnabled(e.target.checked); setSplitError(''); }}
                                        className="w-4 h-4 accent-[var(--accent)]"
                                    />
                                    <span className="opensid-label mb-0">Split transaction</span>
                                </label>
                                {splitEnabled && (
                                    <div className="flex flex-col gap-2 pl-6">
                                        {splitRows.map((row, i) => (
                                            <div key={i} className="flex gap-2 items-start">
                                                <input
                                                    type="text"
                                                    className="opensid-input flex-1"
                                                    placeholder="Category"
                                                    value={row.category}
                                                    onChange={(e) => updateSplitRow(i, 'category', e.target.value)}
                                                />
                                                <input
                                                    type="number"
                                                    min="0.01"
                                                    step="0.01"
                                                    className="opensid-input w-28"
                                                    placeholder="Amount"
                                                    value={row.amount}
                                                    onChange={(e) => updateSplitRow(i, 'amount', e.target.value)}
                                                />
                                                <button
                                                    type="button"
                                                    aria-label={`Remove split row ${i + 1}`}
                                                    className="opensid-icon-btn"
                                                    disabled={splitRows.length <= 2}
                                                    onClick={() => removeSplitRow(i)}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ))}
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex gap-2">
                                                <button type="button" className="opensid-btn opensid-btn-ghost opensid-btn-sm" onClick={addSplitRow}>
                                                    + Add split
                                                </button>
                                                <button type="button" className="opensid-btn opensid-btn-ghost opensid-btn-sm" onClick={distributeEvenly}>
                                                    Distribute evenly
                                                </button>
                                            </div>
                                            <span
                                                className="text-xs font-semibold font-body"
                                                style={{ color: splitRemaining === 0 ? 'var(--green)' : 'var(--red)' }}
                                            >
                                                Remaining: ${splitRemaining.toFixed(2)}
                                            </span>
                                        </div>
                                        {splitError && <span className="text-xs text-[var(--red)]">{splitError}</span>}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Date */}
                        <div className="flex flex-col gap-[5px]">
                            <label htmlFor="date" className="opensid-label">Date</label>
                            <input
                                id="date"
                                type="date"
                                className="opensid-input"
                                value={date}
                                onChange={(e) => { setDate(e.target.value); setErrors((p) => ({ ...p, date: undefined })); }}
                            />
                            {errors.date && <span className="text-xs text-[var(--red)]">{errors.date}</span>}
                        </div>

                        {/* Notes */}
                        <div className="flex flex-col gap-[5px]">
                            <label className="opensid-label">Notes (optional)</label>
                            <textarea
                                rows={2}
                                className="opensid-input resize-y"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                        </div>

                        {/* Repeat */}
                        {!isGenerated && (
                            <div className="flex flex-col gap-3">
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={repeat}
                                        onChange={(e) => setRepeat(e.target.checked)}
                                        className="w-4 h-4 accent-[var(--accent)]"
                                    />
                                    <span className="opensid-label mb-0">Repeat</span>
                                </label>
                                {repeat && (
                                    <div className="flex flex-col gap-3 pl-6">
                                        <div className="flex flex-col gap-[5px]">
                                            <label className="opensid-label">Frequency</label>
                                            <select
                                                className="opensid-input"
                                                value={recurrence}
                                                onChange={(e) => setRecurrence(e.target.value as RecurrenceFrequency)}
                                            >
                                                {RECURRENCE_OPTIONS.map((o) => (
                                                    <option key={o.value} value={o.value}>{o.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="flex flex-col gap-[5px]">
                                            <label className="opensid-label">End date (optional)</label>
                                            <input
                                                type="date"
                                                className="opensid-input"
                                                value={recurrenceEndDate}
                                                onChange={(e) => { setRecurrenceEndDate(e.target.value); setErrors((p) => ({ ...p, recurrence_end_date: undefined })); }}
                                            />
                                            {errors.recurrence_end_date && <span className="text-xs text-[var(--red)]">{errors.recurrence_end_date}</span>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Attachments */}
                        <AttachmentManager
                            transactionId={initial?.id}
                            pendingFiles={pendingFiles}
                            onPendingFilesChange={setPendingFiles}
                        />

                        {initial?.created_at && (
                            <p className="text-xs text-[var(--text-muted)] text-right">
                                Created {formatDateTime(initial.created_at)}
                            </p>
                        )}

                        <div className="flex items-center pt-1 gap-2.5">
                            {!initial && (
                                <label className="flex items-center gap-2 cursor-pointer select-none flex-1">
                                    <input
                                        type="checkbox"
                                        checked={addAnother}
                                        onChange={(e) => {
                                            setAddAnother(e.target.checked);
                                            localStorage.setItem('opensid:addAnotherTransaction', String(e.target.checked));
                                        }}
                                        className="w-4 h-4 accent-[var(--accent)]"
                                    />
                                    <span className="opensid-label mb-0">Add another</span>
                                </label>
                            )}
                            <div className="flex gap-2.5 ml-auto">
                                <button type="button" className="opensid-btn opensid-btn-ghost" onClick={handleCancel}>Cancel</button>
                                <button type="submit" className="opensid-btn opensid-btn-primary" disabled={splitEnabled && splitRemaining !== 0}>Save transaction</button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
        {showDiscardConfirm && (
            <ConfirmDialog
                message="You have unsaved changes. Discard them?"
                confirmLabel="Discard"
                onConfirm={onCancel}
                onCancel={() => setShowDiscardConfirm(false)}
            />
        )}
        </>
    );
}
