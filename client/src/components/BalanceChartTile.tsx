import { useQuery } from '@tanstack/react-query';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    type TooltipContentProps,
} from 'recharts';
import { getBalanceChart } from '../api/charts';
import { formatChartWindow } from '../utils/chartWindow';
import { formatCents, formatDate, balanceColor } from '../utils/format';
import { Tile } from './Tile';

interface Props {
    accountId: number;
    accountName: string;
    window: string;
    showBalance: boolean;
    balanceCents: number | null;
    savedViewId: number | null;
}

function formatYAxis(value: number): string {
    const abs = Math.abs(value) / 100;
    if (abs >= 1000) return `$${(abs / 1000).toFixed(1)}k`;
    return `$${abs.toFixed(0)}`;
}

function CustomTooltip({ active, payload, label }: TooltipContentProps) {
    const value = payload?.[0]?.value;
    if (!active || !payload?.length || typeof label !== 'string' || typeof value !== 'number') return null;

    return (
        <div className="bg-[var(--white)] [border:1.5px_solid_var(--border)] rounded-lg px-3 py-2 shadow-[var(--shadow-md)] text-xs font-body">
            <p className="text-[var(--text-muted)] mb-0.5">{formatDate(label)}</p>
            <p className="font-semibold text-[var(--text-primary)]">{formatCents(value)}</p>
        </div>
    );
}

export default function BalanceChartTile({ accountId, accountName, window, showBalance, balanceCents, savedViewId }: Props) {
    const { data = [], isLoading } = useQuery({
        queryKey: ['chart-balance', accountId, window, savedViewId],
        queryFn: () => getBalanceChart(accountId, window, savedViewId),
    });
    const windowLabel = formatChartWindow(window);

    return (
        <Tile accountName={accountName} accountId={accountId}>
            {showBalance && balanceCents !== null && (
                <div
                    className="font-display text-[28px] font-bold mb-[14px] tracking-[-0.02em]"
                    style={{ color: balanceColor(balanceCents) }}
                >
                    {formatCents(balanceCents)}
                </div>
            )}

            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)] font-body">
                {windowLabel}
            </p>

            {isLoading && (
                <div className="flex-1 flex items-center justify-center min-h-[140px]">
                    <p className="text-xs text-[var(--text-muted)] italic">Loading…</p>
                </div>
            )}

            {!isLoading && data.length === 0 && (
                <div className="flex-1 flex items-center justify-center min-h-[140px]">
                    <p className="text-xs text-[var(--text-muted)] italic">No data for this period.</p>
                </div>
            )}

            {!isLoading && data.length > 0 && (
                <div className="flex-1 min-h-[140px]">
                    <ResponsiveContainer width="100%" height={160}>
                        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                            <XAxis
                                dataKey="date"
                                tickFormatter={(d) => {
                                    // parseInt strips leading zeros ("05" → 5) that raw string slices would keep
                                    const [, m, day] = d.split('-');
                                    return `${parseInt(day)}/${parseInt(m)}`;
                                }}
                                tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}
                                tickLine={false}
                                axisLine={false}
                                minTickGap={40}
                            />
                            <YAxis
                                tickFormatter={formatYAxis}
                                tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}
                                tickLine={false}
                                axisLine={false}
                                width={48}
                            />
                            <Tooltip content={(props) => <CustomTooltip {...props} />} />
                            <Line
                                type="monotone"
                                dataKey="balance_cents"
                                stroke="var(--teak)"
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 4, fill: 'var(--teak)' }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}
        </Tile>
    );
}
