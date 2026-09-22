import db from '../db';
import { getNextDate, today, type Frequency } from '../recurrence/service';

export interface ForecastEvent {
    date: string;
    label: string;
    amount_cents: number;
    kind: 'recurring';
}

export interface ForecastDailyPoint {
    date: string;
    balance_cents: number;
}

export interface ForecastPayload {
    starting_balance_cents: number;
    window_days: number;
    include_discretionary: boolean;
    discretionary_per_day_cents: number;
    closing_balance_cents: number;
    lowest_balance_cents: number;
    lowest_balance_date: string;
    zero_crossing_date: string | null;
    events: ForecastEvent[];
    daily: ForecastDailyPoint[];
}

interface ComputeForecastInput {
    accountId: number;
    days: number;
    includeDiscretionary: boolean;
}

interface TemplateRow {
    id: number;
    account_id: number;
    description: string;
    amount_cents: number;
    type: string;
    recurrence: Frequency;
    recurrence_end_date: string | null;
    transfer_group_id: string | null;
}

function addDays(dateStr: string, delta: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d + delta);
    const yy = date.getFullYear();
    const mm = date.getMonth() + 1;
    const dd = date.getDate();
    return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

function getStartingBalance(accountId: number): number {
    const row = db
        .prepare(`SELECT COALESCE(SUM(amount_cents), 0) AS bal FROM transactions WHERE account_id = ? AND deleted_at IS NULL AND split_parent_id IS NULL`)
        .get(accountId) as { bal: number };
    return row.bal;
}

export function averageDailyDiscretionary(accountId: number): number {
    const todayStr = today();
    const fromDate = addDays(todayStr, -90);
    const row = db
        .prepare(
            `SELECT COALESCE(SUM(amount_cents), 0) AS total
             FROM transactions
             WHERE account_id = ? AND deleted_at IS NULL AND split_parent_id IS NULL AND type = 'expense'
               AND recurrence IS NULL AND recurrence_source_id IS NULL
               AND date >= ? AND date < ?`,
        )
        .get(accountId, fromDate, todayStr) as { total: number };
    return Math.abs(row.total) / 90;
}

function lastOccurrenceDate(templateId: number): string | null {
    const row = db
        .prepare(
            `SELECT MAX(date) AS last_date FROM transactions
             WHERE (id = ? OR recurrence_source_id = ?) AND deleted_at IS NULL`,
        )
        .get(templateId, templateId) as { last_date: string | null };
    return row.last_date;
}

export function computeForecast({ accountId, days, includeDiscretionary }: ComputeForecastInput): ForecastPayload {
    const todayStr = today();
    const windowEnd = addDays(todayStr, days);
    const startingBalance = getStartingBalance(accountId);

    const templates = db
        .prepare(
            `SELECT id, account_id, description, amount_cents, type, recurrence, recurrence_end_date, transfer_group_id
             FROM transactions
             WHERE recurrence IS NOT NULL AND recurrence_source_id IS NULL AND deleted_at IS NULL`,
        )
        .all() as TemplateRow[];

    const events: ForecastEvent[] = [];

    for (const tmpl of templates) {
        let relevant = false;
        let amountCents = tmpl.amount_cents;
        let label = tmpl.description;

        if (tmpl.type === 'transfer' && tmpl.transfer_group_id) {
            if (tmpl.account_id === accountId) {
                relevant = true;
            } else {
                const destTmpl = db
                    .prepare(
                        `SELECT account_id, description, amount_cents FROM transactions
                         WHERE transfer_group_id = ? AND id != ? AND deleted_at IS NULL AND recurrence_source_id IS NULL`,
                    )
                    .get(tmpl.transfer_group_id, tmpl.id) as { account_id: number; description: string; amount_cents: number } | undefined;
                if (destTmpl && destTmpl.account_id === accountId) {
                    relevant = true;
                    amountCents = destTmpl.amount_cents;
                    label = destTmpl.description;
                }
            }
        } else if (tmpl.account_id === accountId) {
            relevant = true;
        }

        if (!relevant) continue;

        const lastDate = lastOccurrenceDate(tmpl.id);
        if (!lastDate) continue;

        const ceiling = tmpl.recurrence_end_date && tmpl.recurrence_end_date < windowEnd
            ? tmpl.recurrence_end_date
            : windowEnd;

        let next = getNextDate(lastDate, tmpl.recurrence);
        while (next <= ceiling) {
            if (next > todayStr) {
                events.push({ date: next, label, amount_cents: amountCents, kind: 'recurring' });
            }
            next = getNextDate(next, tmpl.recurrence);
        }
    }

    const discretionaryPerDayCents = includeDiscretionary ? Math.round(averageDailyDiscretionary(accountId)) : 0;

    const eventsByDate = new Map<string, number>();
    for (const e of events) {
        eventsByDate.set(e.date, (eventsByDate.get(e.date) ?? 0) + e.amount_cents);
    }

    const daily: ForecastDailyPoint[] = [];
    let running = startingBalance;
    let lowest = Infinity;
    let lowestDate = '';
    let zeroCrossingDate: string | null = null;

    for (let i = 1; i <= days; i++) {
        const date = addDays(todayStr, i);
        running += eventsByDate.get(date) ?? 0;
        if (includeDiscretionary) running -= discretionaryPerDayCents;
        daily.push({ date, balance_cents: running });
        if (running < lowest) {
            lowest = running;
            lowestDate = date;
        }
        if (zeroCrossingDate === null && running < 0) {
            zeroCrossingDate = date;
        }
    }

    const closingBalance = daily.length > 0 ? daily[daily.length - 1].balance_cents : startingBalance;

    return {
        starting_balance_cents: startingBalance,
        window_days: days,
        include_discretionary: includeDiscretionary,
        discretionary_per_day_cents: discretionaryPerDayCents,
        closing_balance_cents: closingBalance,
        lowest_balance_cents: lowest === Infinity ? startingBalance : lowest,
        lowest_balance_date: lowestDate || todayStr,
        zero_crossing_date: zeroCrossingDate,
        events: events.sort((a, b) => a.date.localeCompare(b.date)),
        daily,
    };
}
