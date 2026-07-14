import axios from 'axios';

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

export interface Forecast {
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

export async function getForecast(accountId: number, days: number, includeDiscretionary: boolean): Promise<Forecast> {
    const { data } = await axios.get<Forecast>(`/api/accounts/${accountId}/forecast`, {
        params: { days, include_discretionary: includeDiscretionary },
    });
    return data;
}
