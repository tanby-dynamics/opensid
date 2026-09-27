import { useQuery } from '@tanstack/react-query';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell,
    type TooltipContentProps,
} from 'recharts';
import { getCategoryChart, type CategoryTotal } from '../api/charts';
import { formatCents } from '../utils/format';
import { Tile } from './Tile';

interface Props {
    accountId: number;
    accountName: string;
    window: string;
    savedViewId: number | null;
}

interface CategoryChartEntry extends CategoryTotal {
    breakdown?: CategoryTotal[];
}

const TOP_N = 5;

function formatXAxis(value: number): string {
    const abs = Math.abs(value) / 100;
    if (abs >= 1000) return `$${(abs / 1000).toFixed(1)}k`;
    return `$${abs.toFixed(0)}`;
}

function CustomTooltip({ active, payload, label }: TooltipContentProps) {
    const entry = payload?.[0];
    const value = entry?.value;
    if (!active || !payload?.length || typeof label !== 'string' || typeof value !== 'number') return null;

    const breakdown = (entry as { payload?: CategoryChartEntry })?.payload?.breakdown;

    return (
        <div className="bg-[var(--white)] [border:1.5px_solid_var(--border)] rounded-lg px-3 py-2 shadow-[var(--shadow-md)] text-xs font-body">
            <p className="text-[var(--text-muted)] mb-0.5">{label}</p>
            {breakdown ? (
                <ul className="space-y-0.5">
                    {breakdown.map((item) => (
                        <li key={item.category} className="flex justify-between gap-4">
                            <span className="text-[var(--text-secondary)]">{item.category}</span>
                            <span className="font-semibold text-[var(--text-primary)]">{formatCents(item.total_cents)}</span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="font-semibold text-[var(--text-primary)]">{formatCents(value)}</p>
            )}
        </div>
    );
}

export default function CategoryChartTile({ accountId, accountName, window, savedViewId }: Props) {
    const { data = [], isLoading } = useQuery({
        queryKey: ['chart-categories', accountId, window, savedViewId],
        queryFn: () => getCategoryChart(accountId, window, savedViewId),
    });

    const chartData: CategoryChartEntry[] = data.length >= 7
        ? [
            ...data.slice(0, TOP_N),
            {
                category: 'Other',
                total_cents: data.slice(TOP_N).reduce((sum, item) => sum + item.total_cents, 0),
                breakdown: data.slice(TOP_N),
            },
        ]
        : data;

    const barHeight = 28;
    const chartHeight = Math.max(chartData.length * barHeight + 20, 100); // +20 for axis margin; 100 minimum prevents collapse

    return (
        <Tile accountName={accountName} accountId={accountId}>
            {isLoading && (
                <div className="flex-1 flex items-center justify-center min-h-[100px]">
                    <p className="text-xs text-[var(--text-muted)] italic">Loading…</p>
                </div>
            )}

            {!isLoading && data.length === 0 && (
                <div className="flex-1 flex items-center justify-center min-h-[100px]">
                    <p className="text-xs text-[var(--text-muted)] italic">No data for this period.</p>
                </div>
            )}

            {!isLoading && data.length > 0 && (
                <div style={{ height: chartHeight }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={chartData}
                            layout="vertical"
                            margin={{ top: 0, right: 4, bottom: 0, left: 0 }}
                        >
                            <XAxis
                                type="number"
                                dataKey="total_cents"
                                tickFormatter={formatXAxis}
                                tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                type="category"
                                dataKey="category"
                                tick={{ fontSize: 10, fill: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
                                tickLine={false}
                                axisLine={false}
                                width={90}
                            />
                            <Tooltip content={(props) => <CustomTooltip {...props} />} cursor={{ fill: 'var(--cream)' }} />
                            <Bar dataKey="total_cents" radius={[0, 3, 3, 0]}>
                                {chartData.map((_, i) => (
                                    <Cell key={i} fill="var(--teak)" fillOpacity={1 - i * 0.07} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </Tile>
    );
}
