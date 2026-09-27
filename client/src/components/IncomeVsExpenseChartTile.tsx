import { useQuery } from '@tanstack/react-query';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    type TooltipContentProps,
} from 'recharts';
import { getIncomeVsExpenseChart } from '../api/charts';
import { formatChartWindow } from '../utils/chartWindow';
import { formatCents } from '../utils/format';
import { Tile } from './Tile';

interface Props {
    accountId: number;
    accountName: string;
    window: string;
    savedViewId: number | null;
}

function formatYAxis(value: number): string {
    const abs = Math.abs(value) / 100;
    if (abs >= 1000) return `$${(abs / 1000).toFixed(1)}k`;
    return `$${abs.toFixed(0)}`;
}

function formatMonthLabel(month: string): string {
    const [year, m] = month.split('-');
    const date = new Date(parseInt(year), parseInt(m) - 1, 1);
    return date.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' });
}

function CustomTooltip({ active, payload, label }: TooltipContentProps) {
    if (!active || !payload?.length || typeof label !== 'string') return null;

    const income = payload.find((p) => p.dataKey === 'income_cents')?.value;
    const expense = payload.find((p) => p.dataKey === 'expense_cents')?.value;

    return (
        <div className="bg-[var(--white)] [border:1.5px_solid_var(--border)] rounded-lg px-3 py-2 shadow-[var(--shadow-md)] text-xs font-body">
            <p className="text-[var(--text-muted)] mb-1">{formatMonthLabel(label)}</p>
            {typeof income === 'number' && (
                <p className="text-[var(--green)] font-semibold">Income: {formatCents(income)}</p>
            )}
            {typeof expense === 'number' && (
                <p className="text-[var(--red)] font-semibold">Expenses: {formatCents(expense)}</p>
            )}
        </div>
    );
}

export default function IncomeVsExpenseChartTile({ accountId, accountName, window, savedViewId }: Props) {
    const { data = [], isLoading } = useQuery({
        queryKey: ['chart-income-vs-expense', accountId, window, savedViewId],
        queryFn: () => getIncomeVsExpenseChart(accountId, window, savedViewId),
    });
    const windowLabel = formatChartWindow(window);

    return (
        <Tile accountName={accountName} accountId={accountId}>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)] font-body">
                Income vs Expenses — {windowLabel}
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
                        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="30%">
                            <XAxis
                                dataKey="month"
                                tickFormatter={formatMonthLabel}
                                tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}
                                tickLine={false}
                                axisLine={false}
                                minTickGap={20}
                            />
                            <YAxis
                                tickFormatter={formatYAxis}
                                tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}
                                tickLine={false}
                                axisLine={false}
                                width={48}
                            />
                            <Tooltip content={(props) => <CustomTooltip {...props} />} cursor={{ fill: 'var(--cream)' }} />
                            <Bar dataKey="income_cents" fill="var(--green)" radius={[3, 3, 0, 0]} />
                            <Bar dataKey="expense_cents" fill="var(--red)" radius={[3, 3, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </Tile>
    );
}
