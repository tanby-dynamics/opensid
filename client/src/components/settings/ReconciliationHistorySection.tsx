import { useState } from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { listAccountsWithBalances } from '../../api/accounts';
import { listReconciliations, type Reconciliation } from '../../api/reconciliations';
import { formatCents, formatDate, formatDateTime } from '../../utils/format';
import type { Transaction } from '../../types/transaction';

export default function ReconciliationHistorySection() {
    const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
    const [viewingRecon, setViewingRecon] = useState<Reconciliation | null>(null);

    const { data: accounts = [] } = useQuery({
        queryKey: ['accounts-balances'],
        queryFn: listAccountsWithBalances,
    });

    const { data: reconciliations = [], isLoading } = useQuery({
        queryKey: ['reconciliations', selectedAccountId],
        queryFn: () => listReconciliations(selectedAccountId!),
        enabled: selectedAccountId !== null,
    });

    return (
        <div className="flex flex-col gap-5">
            <div>
                <h2 className="font-display text-lg font-bold text-[var(--teak-dark)] mb-1">Reconciliation history</h2>
                <p className="text-sm text-[var(--text-secondary)]">
                    Past reconciliation sessions per account.
                </p>
            </div>

            <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">Account</label>
                <select
                    className="opensid-input"
                    value={selectedAccountId ?? ''}
                    onChange={(e) => setSelectedAccountId(e.target.value ? Number(e.target.value) : null)}
                >
                    <option value="">Select an account…</option>
                    {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                </select>
            </div>

            {selectedAccountId !== null && (
                <div className="bg-[var(--white)] rounded-2xl [border:1.5px_solid_var(--border)] overflow-hidden shadow-[var(--shadow-sm)]">
                    {isLoading && (
                        <p className="px-5 py-6 text-sm text-[var(--text-muted)]">Loading…</p>
                    )}
                    {!isLoading && reconciliations.length === 0 && (
                        <p className="px-5 py-6 text-sm text-[var(--text-muted)]">No reconciliations recorded yet.</p>
                    )}
                    {!isLoading && reconciliations.length > 0 && (
                        <>
                            <div className="hidden sm:grid px-5 py-[10px] bg-[var(--cream)] [border-bottom:1.5px_solid_var(--border)]"
                                style={{ gridTemplateColumns: '130px 1fr 160px' }}
                            >
                                {['Statement date', 'Balance', 'Completed'].map((h) => (
                                    <div key={h} className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">{h}</div>
                                ))}
                            </div>
                            {reconciliations.map((r, idx) => (
                                <div
                                    key={r.id}
                                    className="cursor-pointer hover:bg-[var(--cream)] transition-colors"
                                    style={{ borderBottom: idx === reconciliations.length - 1 ? 'none' : '1px solid var(--cream-mid)' }}
                                    onClick={() => setViewingRecon(r)}
                                >
                                    {/* Mobile */}
                                    <div className="sm:hidden px-4 py-3 flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-[13px] font-semibold text-[var(--text-primary)]">
                                                {formatDate(r.statement_date)}
                                            </div>
                                            <div className="text-xs text-[var(--text-muted)]">
                                                {formatCents(r.statement_balance_cents)} · {formatDate(r.completed_at.slice(0, 10))}
                                            </div>
                                        </div>
                                        {r.notes && (
                                            <span className="text-xs text-[var(--text-secondary)] truncate max-w-[120px]">{r.notes}</span>
                                        )}
                                    </div>
                                    {/* Desktop */}
                                    <div
                                        className="hidden sm:grid px-5 py-3 items-center"
                                        style={{ gridTemplateColumns: '130px 1fr 160px' }}
                                    >
                                        <span className="text-[13px] text-[var(--text-muted)]">{formatDate(r.statement_date)}</span>
                                        <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                                            {formatCents(r.statement_balance_cents)}
                                            {r.notes && (
                                                <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">{r.notes}</span>
                                            )}
                                        </span>
                                        <span className="text-[12px] text-[var(--text-muted)]">{formatDateTime(r.completed_at)}</span>
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            )}

            {viewingRecon && (
                <ReconciliationSnapshotDialog
                    reconciliation={viewingRecon}
                    accountId={selectedAccountId!}
                    onClose={() => setViewingRecon(null)}
                />
            )}
        </div>
    );
}

function ReconciliationSnapshotDialog({ reconciliation, accountId, onClose }: {
    reconciliation: Reconciliation;
    accountId: number;
    onClose: () => void;
}) {
    const { data: transactions = [], isLoading } = useQuery<Transaction[]>({
        queryKey: ['transactions', accountId, { to: reconciliation.statement_date, cleared: 'yes' }],
        queryFn: async () => {
            const { data } = await axios.get<Transaction[]>(
                `/api/accounts/${accountId}/transactions`,
                { params: { to: reconciliation.statement_date, cleared: 'yes' } },
            );
            return data;
        },
    });

    return (
        <div
            className="opensid-modal-overlay anim-fade"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="opensid-modal anim-slide-up" style={{ maxWidth: 640 }}>
                <div className="opensid-modal-trim" />
                <div className="opensid-modal-body">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-display text-lg font-bold text-[var(--teak-dark)]">
                            Cleared as of {formatDate(reconciliation.statement_date)}
                        </h2>
                        <button className="opensid-btn opensid-btn-ghost opensid-btn-sm" onClick={onClose}>Close</button>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] mb-4">
                        Statement balance: <strong>{formatCents(reconciliation.statement_balance_cents)}</strong>
                        {' · '}Reconciled: {formatDateTime(reconciliation.completed_at)}
                    </p>
                    {isLoading && <p className="text-sm text-[var(--text-muted)]">Loading…</p>}
                    {!isLoading && transactions.length === 0 && (
                        <p className="text-sm text-[var(--text-muted)] italic">No cleared transactions on or before this date.</p>
                    )}
                    {!isLoading && transactions.length > 0 && (
                        <ul className="flex flex-col divide-y divide-[var(--border)] max-h-72 overflow-y-auto">
                            {transactions.map((t) => (
                                <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                                    <div>
                                        <div className="font-semibold text-[var(--text-primary)]">{t.description}</div>
                                        <div className="text-xs text-[var(--text-muted)]">{formatDate(t.date)}</div>
                                    </div>
                                    <span className="font-bold" style={{ color: t.amount_cents >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                        {formatCents(t.amount_cents)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
