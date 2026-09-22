import { useState } from 'react';

interface Props {
    onSubmit: (statementDate: string, statementBalanceCents: number) => void;
    onCancel: () => void;
}

export default function ReconcileSetupDialog({ onSubmit, onCancel }: Props) {
    const today = new Date().toISOString().slice(0, 10);
    const [statementDate, setStatementDate] = useState(today);
    const [balanceStr, setBalanceStr] = useState('');
    const [error, setError] = useState('');

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!statementDate) {
            setError('Statement date is required.');
            return;
        }
        if (statementDate > today) {
            setError('Statement date cannot be in the future.');
            return;
        }
        const balance = parseFloat(balanceStr);
        if (balanceStr.trim() === '' || isNaN(balance)) {
            setError('Statement balance is required.');
            return;
        }
        onSubmit(statementDate, Math.round(balance * 100));
    }

    return (
        <div
            className="opensid-modal-overlay anim-fade"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
        >
            <div className="opensid-modal anim-slide-up">
                <div className="opensid-modal-trim" />
                <div className="opensid-modal-body">
                    <h2 className="font-display text-lg font-bold text-[var(--teak-dark)] mb-1">
                        Reconcile account
                    </h2>
                    <p className="text-sm text-[var(--text-secondary)] mb-5">
                        Enter the closing balance and date from your bank statement.
                    </p>

                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">
                                Statement date
                            </label>
                            <input
                                type="date"
                                className="opensid-input"
                                value={statementDate}
                                max={today}
                                onChange={(e) => { setStatementDate(e.target.value); setError(''); }}
                                required
                            />
                        </div>

                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">
                                Closing balance ($)
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                className="opensid-input"
                                placeholder="e.g. 1500.00"
                                value={balanceStr}
                                onChange={(e) => { setBalanceStr(e.target.value); setError(''); }}
                                required
                                autoFocus
                            />
                        </div>

                        {error && (
                            <p className="text-sm text-[var(--red)]">{error}</p>
                        )}

                        <div className="flex justify-end gap-2 pt-1">
                            <button type="button" className="opensid-btn opensid-btn-ghost" onClick={onCancel}>
                                Cancel
                            </button>
                            <button type="submit" className="opensid-btn opensid-btn-primary">
                                Start reconciling
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
