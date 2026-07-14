import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getNetWorth, getNetWorthHistory } from '../api/netWorth';
import { formatCents, balanceColor } from '../utils/format';

export default function NetWorthTile() {
    const [showBreakdown, setShowBreakdown] = useState(false);

    const { data: netWorth, isLoading } = useQuery({
        queryKey: ['net-worth'],
        queryFn: getNetWorth,
    });

    const { data: history = [] } = useQuery({
        queryKey: ['net-worth-history', '30d'],
        queryFn: () => getNetWorthHistory('30d'),
    });

    const trend = history.length >= 2 ? history[history.length - 1].total_cents - history[0].total_cents : null;
    const trendPct = trend !== null && history[0].total_cents !== 0
        ? (trend / Math.abs(history[0].total_cents)) * 100
        : null;

    return (
        <div className="bg-[var(--white)] rounded-[var(--radius-card)] shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] [border:1.5px_solid_var(--border)] overflow-hidden transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 flex flex-col">
            <div className="wood-stripe h-6 shrink-0" />
            <div className="px-5 py-[18px] flex-1 flex flex-col">
                <div className="mb-2.5 font-body font-bold text-[15px] text-[var(--text-primary)] leading-[1.3]">
                    Net Worth
                </div>

                {isLoading && <p className="text-xs text-[var(--text-muted)] italic">Loading…</p>}

                {!isLoading && netWorth && (
                    <>
                        <div
                            className="font-display text-[28px] font-bold mb-1 tracking-[-0.02em]"
                            style={{ color: balanceColor(netWorth.total_cents) }}
                        >
                            {formatCents(netWorth.total_cents)}
                        </div>

                        {trend !== null && (
                            <p className="mb-3 text-[12px] font-body" style={{ color: balanceColor(trend) }}>
                                {trend >= 0 ? '+' : '−'}{formatCents(Math.abs(trend)).replace(/^[+−]/, '')}
                                {trendPct !== null && ` (${trendPct >= 0 ? '+' : ''}${trendPct.toFixed(0)}%)`} vs 30 days ago
                            </p>
                        )}

                        <div className="flex justify-between text-[13px] font-body text-[var(--text-secondary)] mb-2">
                            <span>Assets</span>
                            <span>{formatCents(netWorth.assets_cents)}</span>
                        </div>
                        <div className="flex justify-between text-[13px] font-body text-[var(--text-secondary)] mb-2">
                            <span>Liabilities</span>
                            <span>{'−'}{formatCents(netWorth.liabilities_cents).replace(/^[+−]/, '')}</span>
                        </div>

                        <button
                            className="text-[12px] font-body text-[var(--teak)] text-left mt-1 underline-offset-2 hover:underline"
                            onClick={() => setShowBreakdown((v) => !v)}
                        >
                            {showBreakdown ? 'Hide breakdown' : 'Show breakdown'}
                        </button>

                        {showBreakdown && (
                            <div className="mt-3 flex flex-col gap-1.5">
                                {netWorth.accounts.map((a) => (
                                    <div key={a.id} className="flex justify-between text-[12px] font-body text-[var(--text-muted)]">
                                        <span>{a.name}</span>
                                        <span style={{ color: balanceColor(a.balance_cents) }}>{formatCents(a.balance_cents)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
