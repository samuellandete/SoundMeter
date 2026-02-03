# Trends & Comparison Feature Design

**Date:** 2026-02-03
**Status:** Approved

## Overview

Add a new "Trends" section to the SoundMeter app that enables comparison of sound data across different days, weeks, and months. Data is always segmented by location zone and time slot — these dimensions are never mixed.

## Requirements

### Comparison Modes
- **Side-by-side:** Compare specific days/weeks/months as separate datasets on the same chart
- **Aggregated trends:** Show averages over time (e.g., daily averages across a month)
- **Period-over-period:** Compare "this week" to "last week" or "January" to "February"

### Data Segmentation
- **Time slots** (Period 1-4) are always kept separate — never aggregated together
- **Location zones** (Zone 1-5) are always kept separate — never aggregated together
- Traffic light zone breakdown (green/orange/red) based on current dB thresholds

### Period Granularity
- **Day:** Single calendar day (lunch period 11:30-13:30)
- **Week:** Monday through Friday (ISO week, lunch periods only)
- **Month:** All days in calendar month (lunch periods only)

## UI Design

### Navigation
New top-level section: **SoundMeter | Logs | Trends | Config**

### Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [Day]  [Week]  [Month]              ← Granularity tabs     │
├─────────────────────────────────────────────────────────────┤
│  Presets: [Last 7 days] [Last 4 weeks] [Last 3 months]      │
│           [Custom range...]                                  │
│  Selected: Jan 6, Jan 7, Jan 8, Jan 9  [Clear]              │
├─────────────────────────────────────────────────────────────┤
│  Zone: [Zone 1 ▼]        Period: [Period 1 ▼]               │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────────┐           │
│  │ Average dB          │  │ Peak dB             │           │
│  │ (bar chart)         │  │ (bar chart)         │           │
│  └─────────────────────┘  └─────────────────────┘           │
│  ┌─────────────────────┐  ┌─────────────────────┐           │
│  │ Zone Time %         │  │ Trend Over Time     │           │
│  │ (stacked bars)      │  │ (line chart)        │           │
│  └─────────────────────┘  └─────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

### Filter Combinations

| Zone selection | Period selection | Chart X-axis shows |
|----------------|------------------|-------------------|
| Single zone | Single period | Compared time ranges (days/weeks/months) |
| Single zone | All periods | Periods 1-4, with series per time range |
| All zones | Single period | Zones 1-5, with series per time range |
| All zones | All periods | Grid view: one mini-chart per zone |

### Selection Methods
- **Presets:** Quick buttons for common ranges
- **Custom range:** Date picker for start/end dates
- **Manual selection:** Click specific dates/weeks/months from a list/calendar

## API Design

### Endpoint

`GET /api/trends`

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `granularity` | string | Yes | `day`, `week`, or `month` |
| `start_date` | string | Yes | Range start (YYYY-MM-DD, inclusive) |
| `end_date` | string | Yes | Range end (YYYY-MM-DD, inclusive) |
| `periods` | string | No | Comma-separated specific periods (alternative to range) |
| `slots` | string | No | Time slot IDs to include (default: all) |
| `zones` | string | No | Zone IDs to include (default: all) |

### Response

```json
{
  "granularity": "week",
  "thresholds": {
    "orange": 60,
    "red": 80
  },
  "periods": [
    {
      "label": "Week 2 (Jan 6-10)",
      "start": "2026-01-06",
      "end": "2026-01-10",
      "data": [
        {
          "zone_id": 1,
          "zone_name": "Zone 1",
          "slot_id": 1,
          "slot_name": "Period 1",
          "avg_db": 58.3,
          "peak_db": 82.1,
          "green_pct": 65.0,
          "orange_pct": 25.0,
          "red_pct": 10.0,
          "reading_count": 50
        },
        {
          "zone_id": 1,
          "zone_name": "Zone 1",
          "slot_id": 2,
          "slot_name": "Period 2",
          "avg_db": 62.1,
          "peak_db": 91.0,
          "green_pct": 48.0,
          "orange_pct": 35.0,
          "red_pct": 17.0,
          "reading_count": 48
        }
      ]
    },
    {
      "label": "Week 3 (Jan 13-17)",
      "start": "2026-01-13",
      "end": "2026-01-17",
      "data": [...]
    }
  ]
}
```

## Data Aggregation

### Metrics Per Zone+Slot Combination

| Metric | Calculation |
|--------|-------------|
| `avg_db` | Mean of all readings in the period |
| `peak_db` | Maximum single reading |
| `green_pct` | % of readings ≤ orange_threshold |
| `orange_pct` | % of readings > orange_threshold AND ≤ red_threshold |
| `red_pct` | % of readings > red_threshold |
| `reading_count` | Total number of log entries |

### SQL Pattern

```sql
SELECT
  zone_id,
  time_slot_id,
  AVG(decibels) as avg_db,
  MAX(decibels) as peak_db,
  COUNT(*) as total,
  SUM(CASE WHEN decibels <= :orange THEN 1 ELSE 0 END) as green_count,
  SUM(CASE WHEN decibels > :orange AND decibels <= :red THEN 1 ELSE 0 END) as orange_count,
  SUM(CASE WHEN decibels > :red THEN 1 ELSE 0 END) as red_count
FROM sound_logs
WHERE timestamp >= :start AND timestamp < :end
GROUP BY zone_id, time_slot_id
```

### Period Boundaries

- **Day:** 00:00:00 to 23:59:59 of that date
- **Week:** Monday 00:00:00 to Sunday 23:59:59 (ISO week)
- **Month:** First day 00:00:00 to last day 23:59:59

### Threshold Handling

Thresholds are read from config at query time. Historical data is evaluated against current thresholds, so changing thresholds affects how past data is categorized.

## Implementation Architecture

### Backend

**New files:**
- `backend/routes/trends.py` — Trends blueprint with `/api/trends` endpoint
- `backend/services/trends_service.py` — Aggregation logic

**Modified files:**
- `backend/app.py` — Register trends blueprint

### Frontend

**New files:**
- `frontend/src/components/TrendsView.js` — Main container component
- `frontend/src/components/charts/TrendsCharts.js` — Chart components for trends
- `frontend/src/components/TrendsPeriodSelector.js` — Date range/preset picker

**Modified files:**
- `frontend/src/App.js` — Add Trends navigation tab and routing
- `frontend/src/services/api.js` — Add `getTrends()` method

### Database

No schema changes required. All aggregations are computed on-the-fly from the existing `sound_logs` table.

## Visualizations

### 1. Average dB Bar Chart
- Bars grouped by X-axis category (periods, zones, or time ranges)
- Color-coded by traffic light zone (green/orange/red based on value)
- Multiple series when comparing time ranges

### 2. Peak dB Bar Chart
- Same structure as average chart
- Shows maximum readings to identify spikes

### 3. Zone Time Stacked Bar Chart
- Stacked bars showing green/orange/red percentages
- One stack per X-axis category
- Always totals 100%

### 4. Trend Line Chart
- X-axis: chronological time (days/weeks/months)
- Y-axis: average dB
- One line per zone+slot combination being viewed
- Shows patterns over time

## Future Considerations

- **Performance:** For large date ranges, consider caching or pre-computing daily summaries
- **Export:** Add CSV export for trends data
- **Annotations:** Allow marking specific periods with notes (e.g., "special event")
