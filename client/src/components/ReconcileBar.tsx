import type { Transaction } from '../types/transaction';
import type { Reconciliation } from '../api/reconciliations';
import { formatCents } from '../utils/format';

interface Props {
    statementDate: string;
    statementBalanceCents: number;
    transactions: Transaction[];
    lastReconciliation: Reconciliation | null;
    onFinish: () => void;
    onExit: () => void;
    isFinishing: boolean;
}

export default function ReconcileBar({
    statementDate,
    statementBalanceCents,
    transactions,
    lastReconciliation,
    onFinish,
    onExit,
    isFinishing,
}: Props) {
    const prevBalance = lastReconciliation?.statement_balance_cents ?? 0;
    const prevCompletedAt = lastReconciliation?.completed_at ?? '0000-01-01T00:00:00';

    const clearedInPeriod = transactions
        .filter((t) => t.cleared_at !== null && t.date <= statementDate && t.cleared_at > prevCompletedAt)
        .reduce((sum, t) => sum + t.amount_cents, 0);

    const expected = prevBalance + clearedInPeriod;
    const difference = statementBalanceCents - expected;
    const balanced = difference === 0;

    return (
        <div className="sticky top-0 z-10 bg-[var(--teak-dark)] text-white rounded-2xl mb-4 px-4 py-3 flex flex-wrap items-center gap-4 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
            <div className="flex-1 flex flex-wrap items-center gap-4 min-w-0">
                <div className="flex flex-col min-w-[100px]">
                    <span className="text-[10px] font-bold uppercase tracking-[0.07em] opacity-60">Statement</span>
                    <span className="text-sm font-bold">{formatCents(statementBalanceCents)}</span>
                    <span className="text-[10px] opacity-60">{statementDate}</span>
                </div>
                <div className="flex flex-col min-w-[100px]">
                    <span className="text-[10px] font-bold uppercase tracking-[0.07em] opacity-60">Cleared</span>
                    <span className="text-sm font-bold">{formatCents(prevBalance + clearedInPeriod)}</span>
                </div>
                <div className="flex flex-col min-w-[100px]">
                    <span className="text-[10px] font-bold uppercase tracking-[0.07em] opacity-60">Difference</span>
                    <span
                        className="text-sm font-bold"
                        style={{ color: balanced ? '#6ee7a0' : '#fca5a5' }}
                    >
                        {balanced ? 'Balanced ✓' : formatCents(difference)}
                    </span>
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <button
                    className="opensid-btn opensid-btn-ghost opensid-btn-sm"
                    style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}
                    onClick={onExit}
                >
                    Exit
                </button>
                <button
                    className="opensid-btn opensid-btn-sm"
                    style={{
                        background: balanced ? '#16a34a' : 'rgba(255,255,255,0.15)',
                        color: balanced ? 'white' : 'rgba(255,255,255,0.4)',
                        cursor: balanced ? 'pointer' : 'not-allowed',
                    }}
                    disabled={!balanced || isFinishing}
                    onClick={onFinish}
                    title={balanced ? undefined : `Off by ${formatCents(difference)} — clear or uncheck transactions to match`}
                >
                    {isFinishing ? 'Finishing…' : 'Finish'}
                </button>
            </div>
        </div>
    );
}
