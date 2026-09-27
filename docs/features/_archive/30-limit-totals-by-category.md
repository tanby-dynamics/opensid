# Limit Totals by Category to Top 5

https://github.com/tanby-dynamics/opensid/issues/30

## Summary

The "Totals by category" tile is an existing horizontal bar chart showing expense totals grouped by category for a selected time window. Currently it shows all categories. This feature limits the display to the top 5 categories by total amount, with any remaining categories collapsed into a single "Other" bar that appears last and shows a breakdown tooltip.

## Detailed description

When the tile fetches category data from the API, the server already returns all categories ordered by `total_cents DESC`. The client applies the following transformation before rendering:

- **6 or fewer categories**: render all bars as today, no "Other" bar.
- **7 or more categories**: render the top 5 bars individually, then append a single "Other" bar whose value is the sum of all remaining categories.

The "Other" bar always appears as the last (bottommost) bar, regardless of its total amount relative to the named bars.

The existing `CustomTooltip` is extended so that hovering the "Other" bar shows a breakdown list of every collapsed category and its individual total, rather than just the combined total. All other bars retain their existing tooltip behaviour (category name + formatted total).

The limit of 5 is hardcoded in the client component.

## User stories

- As a user, I want the category chart to stay readable regardless of how many categories I have, so that I can quickly identify my biggest spending areas without scrolling.
- As a user, I want to see what's inside the "Other" bar when I hover it, so that I'm not losing visibility into smaller categories.

## Key decisions

| Decision | Outcome |
|----------|---------|
| Where to apply the top-5 limit | Client-side, inside `CategoryChartTile.tsx`. The server continues to return all categories so the breakdown data is available for the tooltip without an extra API call. |
| Threshold for showing "Other" | Only when there are 7 or more categories. With ≤ 6 categories all are shown individually (collapsing a single category into "Other" is not useful). |
| Position of "Other" bar | Always last (bottom), regardless of its total amount. |
| "Other" tooltip content | Full breakdown: each collapsed category name and its individual formatted total. |
| Limit value | Hardcoded to 5 (not configurable per tile). |

## Acceptance criteria

```gherkin
Feature: Limit totals by category to top 5

  Scenario: Fewer than or equal to 6 categories
    Given the account has 6 or fewer expense categories in the selected period
    When the "Totals by category" tile loads
    Then all categories are displayed as individual bars
    And no "Other" bar is shown

  Scenario: Exactly 7 or more categories
    Given the account has 7 or more expense categories in the selected period
    When the "Totals by category" tile loads
    Then the top 5 categories by total amount are displayed as individual bars
    And a single "Other" bar is shown as the last bar
    And the "Other" bar value equals the sum of all categories not in the top 5

  Scenario: "Other" bar position
    Given the "Other" bar is visible
    Then it always appears as the bottommost bar
    Regardless of whether its total is larger than any of the top 5 bars

  Scenario: Tooltip on a named bar
    Given the "Other" bar is visible
    When the user hovers one of the top 5 named bars
    Then the tooltip shows the category name and its formatted total amount

  Scenario: Tooltip on the "Other" bar
    Given the "Other" bar is visible
    When the user hovers the "Other" bar
    Then the tooltip shows a breakdown of every collapsed category with its individual formatted total
```

## Manual test steps

1. Open the app and navigate to a dashboard that has the "Totals by category" tile.
2. **Many categories case**: ensure the account has 7 or more expense categories in the selected time window.
   - Confirm only 5 named bars appear plus one "Other" bar at the bottom.
   - Confirm the 5 named bars are the ones with the highest totals (cross-check against the transactions list if needed).
   - Hover each of the top 5 bars and confirm the tooltip shows the category name and its total.
   - Hover the "Other" bar and confirm the tooltip lists each collapsed category with its individual total.
   - Confirm the sum of all tooltip amounts in "Other" matches the "Other" bar length visually.
3. **Few categories case**: switch to a time window or account where 6 or fewer categories have transactions.
   - Confirm all categories appear individually with no "Other" bar.
4. **Exactly 6 categories**: if testable, confirm all 6 appear with no "Other" bar.
5. **Exactly 7 categories**: confirm top 5 appear individually and the 6th and 7th are collapsed into "Other".

## Implementation tasks

All changes are client-side only. The server API is unchanged.

1. **Add a `breakdown` field to the chart data type** — in [client/src/components/CategoryChartTile.tsx](client/src/components/CategoryChartTile.tsx), define a local type extending `CategoryTotal`:
   ```ts
   interface CategoryChartEntry extends CategoryTotal {
       breakdown?: CategoryTotal[];
   }
   ```

2. **Compute `chartData` from the raw API response** — after the `useQuery` call, derive `chartData: CategoryChartEntry[]`:
   - If `data.length <= 6`, use `data` as-is.
   - If `data.length >= 7`, take `data.slice(0, 5)` and append one entry `{ category: 'Other', total_cents: <sum of rest>, breakdown: data.slice(5) }`.

3. **Update `chartHeight`** — change the height calculation to use `chartData.length` instead of `data.length`.

4. **Update the chart JSX** — replace `data={data}` with `data={chartData}` on the `<BarChart>` element. Update the `Cell` map to iterate over `chartData`.

5. **Update `CustomTooltip`** — extend the tooltip props to accept `breakdown?: CategoryTotal[]` from the payload entry. When `breakdown` is present, render a list of `name: formatCents(total)` lines instead of the single total line. The `label` ("Other") still appears as the heading.
