import { useState } from 'react';
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
import { getForecast } from '../api/forecast';
import { formatCents, formatDate, balanceColor } from '../utils/format';
import { Tile } from './Tile';

interface Props {
    accountId: number;
    accountName: string;
    days: number;
    includeDiscretionary: boolean;
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

export default function ForecastTile({ accountId, accountName, days, includeDiscretionary }: Props) {
    const [showEvents, setShowEvents] = useState(false);

    const { data: forecast, isLoading } = useQuery({
        queryKey: ['forecast', accountId, days, includeDiscretionary],
        queryFn: () => getForecast(accountId, days, includeDiscretionary),
    });

    const eventDates = new Set(forecast?.events.map((e) => e.date) ?? []);

    return (
        <Tile accountName={accountName} accountId={accountId}>
            {isLoading && (
                <div className="flex-1 flex items-center justify-center min-h-[140px]">
                    <p className="text-xs text-[var(--text-muted)] italic">Loading…</p>
                </div>
            )}

            {!isLoading && forecast && (
                <>
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)] font-body">
                        Next {days} days
                    </p>

                    <div className="grid grid-cols-3 gap-2 mb-3">
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)] font-body mb-0.5">Closing</p>
                            <p className="text-[15px] font-bold font-body" style={{ color: balanceColor(forecast.closing_balance_cents) }}>
                                {formatCents(forecast.closing_balance_cents)}
                            </p>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)] font-body mb-0.5">Lowest</p>
                            <p className="text-[15px] font-bold font-body" style={{ color: balanceColor(forecast.lowest_balance_cents) }}>
                                {formatCents(forecast.lowest_balance_cents)}
                            </p>
                            <p className="text-[10px] text-[var(--text-muted)] font-body">{formatDate(forecast.lowest_balance_date)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)] font-body mb-0.5">Zero</p>
                            {forecast.zero_crossing_date ? (
                                <>
                                    <p className="text-[15px] font-bold font-body" style={{ color: 'var(--red)' }}>
                                        {formatDate(forecast.zero_crossing_date)}
                                    </p>
                                </>
                            ) : (
                                <p className="text-[13px] font-bold font-body" style={{ color: 'var(--green)' }}>
                                    Stays positive
                                </p>
                            )}
                        </div>
                    </div>

                    {includeDiscretionary && (
                        <p
                            className="text-[11px] text-[var(--text-muted)] font-body mb-3 italic"
                            title="Discretionary estimate is your average non-recurring, non-transfer expense per day over the last 90 days, projected forward at a flat rate. It's a rough guide, not a forecast of any specific transaction."
                        >
                            Includes ~{formatCents(forecast.discretionary_per_day_cents)}/day discretionary estimate
                        </p>
                    )}

                    {forecast.daily.length > 0 && (
                        <div className="flex-1 min-h-[140px]">
                            <ResponsiveContainer width="100%" height={160}>
                                <LineChart data={forecast.daily} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
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
                                        dataKey="balance_cents"
                                        stroke="var(--teak)"
                                        strokeWidth={2}
                                        dot={(dotProps) => {
                                            const { cx, cy, payload, key } = dotProps as { cx: number; cy: number; payload: { date: string }; key: string };
                                            if (!eventDates.has(payload.date)) return <g key={key} />;
                                            return <circle key={key} cx={cx} cy={cy} r={3} fill="var(--teak)" />;
                                        }}
                                        activeDot={{ r: 4, fill: 'var(--teak)' }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    <button
                        className="text-[12px] font-body text-[var(--teak)] text-left mt-2 underline-offset-2 hover:underline"
                        onClick={() => setShowEvents((v) => !v)}
                    >
                        {showEvents ? 'Hide events' : `Show events (${forecast.events.length})`}
                    </button>

                    {showEvents && (
                        <div className="mt-2 flex flex-col gap-1">
                            {forecast.events.length === 0 && (
                                <p className="text-[12px] text-[var(--text-muted)] font-body italic">No scheduled events in this window.</p>
                            )}
                            {forecast.events.map((e, i) => (
                                <div key={i} className="flex justify-between text-[12px] font-body text-[var(--text-muted)]">
                                    <span>{formatDate(e.date)} — {e.label}</span>
                                    <span style={{ color: balanceColor(e.amount_cents) }}>{formatCents(e.amount_cents)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </Tile>
    );
}
