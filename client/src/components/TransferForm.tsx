import { useState, useEffect } from 'react';
import type { AccountWithBalance } from '../types/account';
import type { Transaction, RecurrenceFrequency } from '../types/transaction';
import type { TransferPayload } from '../api/transfers';

interface Props {
    accounts: AccountWithBalance[];
    initial?: {
        groupId: string;
        source: Transaction;
        destination: Transaction;
    };
    onSubmit: (payload: TransferPayload) => void;
    onCancel: () => void;
}

interface FormErrors {
    source?: string;
    destination?: string;
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

export default function TransferForm({ accounts, initial, onSubmit, onCancel }: Props) {
    const isEdit = !!initial;

    const [sourceId, setSourceId] = useState<string>(
        initial ? String(initial.source.account_id) : (accounts[0] ? String(accounts[0].id) : ''),
    );
    const [destId, setDestId] = useState<string>(
        initial ? String(initial.destination.account_id) : (accounts[1] ? String(accounts[1].id) : ''),
    );
    const [amount, setAmount] = useState(
        initial ? (Math.abs(initial.source.amount_cents) / 100).toFixed(2) : '',
    );
    const [date, setDate] = useState(
        initial ? initial.source.date : new Date().toISOString().slice(0, 10),
    );
    const [description, setDescription] = useState(initial ? initial.source.description : '');
    const [notes, setNotes] = useState(initial ? (initial.source.notes ?? '') : '');
    const [recurrenceEnabled, setRecurrenceEnabled] = useState(!!(initial?.source.recurrence));
    const [recurrence, setRecurrence] = useState<RecurrenceFrequency>(
        (initial?.source.recurrence as RecurrenceFrequency) ?? 'monthly',
    );
    const [recurrenceEndDate, setRecurrenceEndDate] = useState(initial?.source.recurrence_end_date ?? '');
    const [errors, setErrors] = useState<FormErrors>({});

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [onCancel]);

    const destOptions = accounts.filter((a) => String(a.id) !== sourceId);

    // When source changes, reset dest if they'd match
    function handleSourceChange(val: string) {
        setSourceId(val);
        if (destId === val) {
            const other = accounts.find((a) => String(a.id) !== val);
            setDestId(other ? String(other.id) : '');
        }
    }

    function validate(): boolean {
        const errs: FormErrors = {};
        if (!sourceId) errs.source = 'Source account is required';
        if (!destId) errs.destination = 'Destination account is required';
        if (sourceId && destId && sourceId === destId) errs.destination = 'Source and destination accounts must be different';
        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) errs.amount = 'Amount must be greater than zero';
        if (!date) errs.date = 'Date is required';
        if (recurrenceEnabled && recurrenceEndDate) {
            if (recurrenceEndDate <= date) errs.recurrence_end_date = 'End date must be after the transfer date';
            const today = new Date().toISOString().slice(0, 10);
            if (recurrenceEndDate <= today) errs.recurrence_end_date = 'End date must be in the future';
        }
        setErrors(errs);
        return Object.keys(errs).length === 0;
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!validate()) return;
        onSubmit({
            source_account_id: Number(sourceId),
            destination_account_id: Number(destId),
            amount: Number(amount),
            date,
            description: description.trim() || undefined,
            notes: notes.trim() || null,
            recurrence: recurrenceEnabled ? recurrence : null,
            recurrence_end_date: recurrenceEnabled && recurrenceEndDate ? recurrenceEndDate : null,
        });
    }

    return (
        <div className="opensid-modal-overlay anim-fade" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
            <div className="opensid-modal anim-slide-up">
                <div className="opensid-modal-trim" />
                <div className="opensid-modal-body">
                    <h2 className="font-display text-lg font-bold text-[var(--teak-dark)] mb-5">
                        {isEdit ? 'Edit transfer' : 'New transfer'}
                    </h2>
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <div className="flex gap-3">
                            <div className="flex-1 flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">From</label>
                                <select
                                    className={`opensid-input${errors.source ? ' border-[var(--red)]' : ''}`}
                                    value={sourceId}
                                    onChange={(e) => handleSourceChange(e.target.value)}
                                >
                                    {accounts.map((a) => (
                                        <option key={a.id} value={String(a.id)}>{a.name}</option>
                                    ))}
                                </select>
                                {errors.source && <span className="text-[11px] text-[var(--red)]">{errors.source}</span>}
                            </div>
                            <div className="flex items-end pb-[6px] text-[var(--text-muted)] text-lg">→</div>
                            <div className="flex-1 flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">To</label>
                                <select
                                    className={`opensid-input${errors.destination ? ' border-[var(--red)]' : ''}`}
                                    value={destId}
                                    onChange={(e) => setDestId(e.target.value)}
                                >
                                    {destOptions.map((a) => (
                                        <option key={a.id} value={String(a.id)}>{a.name}</option>
                                    ))}
                                </select>
                                {errors.destination && <span className="text-[11px] text-[var(--red)]">{errors.destination}</span>}
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <div className="flex-1 flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">Amount</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    className={`opensid-input${errors.amount ? ' border-[var(--red)]' : ''}`}
                                    placeholder="0.00"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    autoFocus={!isEdit}
                                />
                                {errors.amount && <span className="text-[11px] text-[var(--red)]">{errors.amount}</span>}
                            </div>
                            <div className="flex-1 flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">Date</label>
                                <input
                                    type="date"
                                    className={`opensid-input${errors.date ? ' border-[var(--red)]' : ''}`}
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                />
                                {errors.date && <span className="text-[11px] text-[var(--red)]">{errors.date}</span>}
                            </div>
                        </div>

                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">Description <span className="font-normal normal-case">(optional)</span></label>
                            <input
                                type="text"
                                className="opensid-input"
                                placeholder="Transfer"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                        </div>

                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">Notes <span className="font-normal normal-case">(optional)</span></label>
                            <textarea
                                className="opensid-input resize-none"
                                rows={2}
                                placeholder="Any extra details…"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="flex items-center gap-2 text-xs font-body text-[var(--text)] cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={recurrenceEnabled}
                                    onChange={(e) => setRecurrenceEnabled(e.target.checked)}
                                    className="w-4 h-4 cursor-pointer accent-[var(--teak)]"
                                />
                                Recurring transfer
                            </label>
                            {recurrenceEnabled && (
                                <div className="flex gap-3 pl-6">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">Frequency</label>
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
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">End date <span className="font-normal normal-case">(optional)</span></label>
                                        <input
                                            type="date"
                                            className={`opensid-input${errors.recurrence_end_date ? ' border-[var(--red)]' : ''}`}
                                            value={recurrenceEndDate}
                                            onChange={(e) => setRecurrenceEndDate(e.target.value)}
                                        />
                                        {errors.recurrence_end_date && (
                                            <span className="text-[11px] text-[var(--red)]">{errors.recurrence_end_date}</span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-2.5 pt-1">
                            <button type="button" className="opensid-btn opensid-btn-ghost" onClick={onCancel}>Cancel</button>
                            <button type="submit" className="opensid-btn opensid-btn-primary">
                                {isEdit ? 'Save changes' : 'Create transfer'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
