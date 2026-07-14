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
import { getNetWorthHistory } from '../api/netWorth';
import { formatChartWindow } from '../utils/chartWindow';
import { formatCents, formatDate } from '../utils/format';

interface Props {
    window: string;
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

export default function NetWorthChartTile({ window }: Props) {
    const { data = [], isLoading } = useQuery({
        queryKey: ['net-worth-history', window],
        queryFn: () => getNetWorthHistory(window),
    });
    const windowLabel = formatChartWindow(window);

    return (
        <div className="bg-[var(--white)] rounded-[var(--radius-card)] shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] [border:1.5px_solid_var(--border)] overflow-hidden transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 flex flex-col">
            <div className="wood-stripe h-6 shrink-0" />
            <div className="px-5 py-[18px] flex-1 flex flex-col">
                <div className="mb-2.5 font-body font-bold text-[15px] text-[var(--text-primary)] leading-[1.3]">
                    Net Worth Over Time
                </div>

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
                                    dataKey="total_cents"
                                    stroke="var(--teak)"
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 4, fill: 'var(--teak)' }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>
        </div>
    );
}
