export const FORECAST_WINDOW_OPTIONS = [
    { value: '14d', label: 'Next 14 days' },
    { value: '30d', label: 'Next 30 days' },
    { value: '60d', label: 'Next 60 days' },
    { value: '90d', label: 'Next 90 days' },
];

export function formatChartWindow(window: string): string {
    if (window === '30d') return 'Last 30 days';
    if (window === '3m') return 'Last 3 months';
    if (window === '6m') return 'Last 6 months';
    if (window === '12m') return 'Last 12 months';
    if (window === 'all') return 'All time';

    const weeksMatch = window.match(/^(\d+)w$/);
    if (weeksMatch) {
        const weeks = parseInt(weeksMatch[1], 10);
        return `Last ${weeks} week${weeks === 1 ? '' : 's'}`;
    }

    return window;
}