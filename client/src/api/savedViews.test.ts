import { describe, it, expect } from 'vitest';
import { sanitiseSavedFilters } from './savedViews';

describe('sanitiseSavedFilters', () => {
    it('keeps known keys verbatim', () => {
        const result = sanitiseSavedFilters({
            keyword: 'hi',
            from: '2026-01-01',
            to: '2026-12-31',
            category: 'Groceries',
            type: 'expense',
            amountMin: '10',
            amountMax: '100',
            hasAttachment: 'yes',
            recurringOnly: true,
            cleared: 'yes',
        });
        expect(result).toEqual({
            keyword: 'hi',
            from: '2026-01-01',
            to: '2026-12-31',
            category: 'Groceries',
            type: 'expense',
            amountMin: '10',
            amountMax: '100',
            hasAttachment: 'yes',
            recurringOnly: true,
            cleared: 'yes',
        });
    });

    it('drops unknown keys', () => {
        const result = sanitiseSavedFilters({
            keyword: 'hi',
            futureKnob: 'on',
            futureWidget: 'xyz',
        }) as Record<string, unknown>;
        expect(result.keyword).toBe('hi');
        expect(result.futureKnob).toBeUndefined();
        expect(result.futureWidget).toBeUndefined();
    });

    it('returns an empty object when given empty input', () => {
        expect(sanitiseSavedFilters({})).toEqual({});
    });
});
