# Trends & Comparison Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Trends" section for comparing sound data across days, weeks, and months with data segmented by zone and time slot.

**Architecture:** New `/api/trends` endpoint with aggregation service, new React TrendsView component with four chart types (average, peak, zone time %, trend line). Data always segmented by zone_id and time_slot_id.

**Tech Stack:** Flask/Python backend, React/Chart.js frontend, SQLite aggregation queries.

---

## Task 1: Create Trends Service with Aggregation Logic

**Files:**
- Create: `backend/services/trends_service.py`
- Test: `backend/tests/test_trends_service.py`

**Step 1: Write the failing test**

Create `backend/tests/test_trends_service.py`:

```python
import pytest
import os
import sys
from datetime import datetime
import pytz

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from database import init_db, get_db_context
from services.trends_service import get_period_aggregations


@pytest.fixture
def test_db():
    """Create a test database with sample data"""
    db_path = 'test_trends.db'
    os.environ['DATABASE_PATH'] = db_path
    init_db(db_path)

    # Insert test data
    cet = pytz.timezone('Europe/Paris')
    with get_db_context(db_path) as conn:
        cursor = conn.cursor()

        # Set thresholds
        cursor.execute(
            "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)",
            ('thresholds', '{"orange_threshold": 60, "red_threshold": 80}')
        )

        # Insert logs for 2026-01-06 (Monday), zone 1, slot 1
        # 3 green (50, 55, 58), 2 orange (65, 70), 1 red (85)
        test_logs = [
            (cet.localize(datetime(2026, 1, 6, 11, 35, 0)).isoformat(), 50.0, 1, 1),
            (cet.localize(datetime(2026, 1, 6, 11, 40, 0)).isoformat(), 55.0, 1, 1),
            (cet.localize(datetime(2026, 1, 6, 11, 45, 0)).isoformat(), 58.0, 1, 1),
            (cet.localize(datetime(2026, 1, 6, 11, 50, 0)).isoformat(), 65.0, 1, 1),
            (cet.localize(datetime(2026, 1, 6, 11, 55, 0)).isoformat(), 70.0, 1, 1),
            (cet.localize(datetime(2026, 1, 6, 11, 58, 0)).isoformat(), 85.0, 1, 1),
        ]

        for ts, db, slot, zone in test_logs:
            cursor.execute(
                'INSERT INTO sound_logs (timestamp, decibels, time_slot_id, zone_id) VALUES (?, ?, ?, ?)',
                (ts, db, slot, zone)
            )
        conn.commit()

    yield db_path

    if os.path.exists(db_path):
        os.remove(db_path)


def test_get_period_aggregations_single_day(test_db):
    """Test aggregation for a single day"""
    result = get_period_aggregations(
        granularity='day',
        start_date='2026-01-06',
        end_date='2026-01-06',
        db_path=test_db
    )

    assert result['granularity'] == 'day'
    assert result['thresholds']['orange'] == 60
    assert result['thresholds']['red'] == 80
    assert len(result['periods']) == 1

    period = result['periods'][0]
    assert period['start'] == '2026-01-06'
    assert period['end'] == '2026-01-06'
    assert len(period['data']) == 1  # 1 zone+slot combo

    data = period['data'][0]
    assert data['zone_id'] == 1
    assert data['slot_id'] == 1
    assert data['reading_count'] == 6
    assert round(data['avg_db'], 1) == 63.8  # (50+55+58+65+70+85)/6
    assert data['peak_db'] == 85.0
    assert round(data['green_pct'], 1) == 50.0  # 3/6
    assert round(data['orange_pct'], 1) == 33.3  # 2/6
    assert round(data['red_pct'], 1) == 16.7  # 1/6
```

**Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_trends_service.py -v`
Expected: FAIL with "ModuleNotFoundError: No module named 'services.trends_service'"

**Step 3: Write minimal implementation**

Create `backend/services/trends_service.py`:

```python
from database import get_db_context
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
import os
import json


def get_db_path():
    return os.getenv('DATABASE_PATH', 'soundmeter.db')


def get_thresholds(db_path=None):
    """Get current thresholds from config"""
    if db_path is None:
        db_path = get_db_path()

    with get_db_context(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM config WHERE key = 'thresholds'")
        row = cursor.fetchone()
        if row:
            thresholds = json.loads(row['value'])
            return {
                'orange': thresholds.get('orange_threshold', 60),
                'red': thresholds.get('red_threshold', 80)
            }
        return {'orange': 60, 'red': 80}


def get_period_boundaries(granularity, start_date_str, end_date_str):
    """
    Generate period boundaries based on granularity.
    Returns list of (label, start_date, end_date) tuples.
    """
    start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
    end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
    periods = []

    if granularity == 'day':
        current = start_date
        while current <= end_date:
            label = current.strftime('%a %b %d')
            periods.append((label, current.isoformat(), current.isoformat()))
            current += timedelta(days=1)

    elif granularity == 'week':
        # Start from Monday of the week containing start_date
        current = start_date - timedelta(days=start_date.weekday())
        while current <= end_date:
            week_end = current + timedelta(days=6)
            week_num = current.isocalendar()[1]
            label = f"Week {week_num} ({current.strftime('%b %d')}-{week_end.strftime('%d')})"
            periods.append((label, current.isoformat(), week_end.isoformat()))
            current += timedelta(days=7)

    elif granularity == 'month':
        current = start_date.replace(day=1)
        while current <= end_date:
            # Last day of month
            if current.month == 12:
                month_end = current.replace(year=current.year + 1, month=1, day=1) - timedelta(days=1)
            else:
                month_end = current.replace(month=current.month + 1, day=1) - timedelta(days=1)
            label = current.strftime('%B %Y')
            periods.append((label, current.isoformat(), month_end.isoformat()))
            current = month_end + timedelta(days=1)

    return periods


def aggregate_period(start_date, end_date, thresholds, slot_ids=None, zone_ids=None, db_path=None):
    """
    Aggregate data for a single period, grouped by zone_id and time_slot_id.
    Returns list of aggregation dicts.
    """
    if db_path is None:
        db_path = get_db_path()

    orange = thresholds['orange']
    red = thresholds['red']

    with get_db_context(db_path) as conn:
        cursor = conn.cursor()

        # Build query with optional filters
        query = '''
            SELECT
                sl.zone_id,
                z.name as zone_name,
                sl.time_slot_id,
                ts.name as slot_name,
                AVG(sl.decibels) as avg_db,
                MAX(sl.decibels) as peak_db,
                COUNT(*) as total,
                SUM(CASE WHEN sl.decibels <= ? THEN 1 ELSE 0 END) as green_count,
                SUM(CASE WHEN sl.decibels > ? AND sl.decibels <= ? THEN 1 ELSE 0 END) as orange_count,
                SUM(CASE WHEN sl.decibels > ? THEN 1 ELSE 0 END) as red_count
            FROM sound_logs sl
            JOIN time_slots ts ON sl.time_slot_id = ts.id
            LEFT JOIN zones z ON sl.zone_id = z.id
            WHERE DATE(sl.timestamp) >= ? AND DATE(sl.timestamp) <= ?
        '''
        params = [orange, orange, red, red, start_date, end_date]

        if slot_ids:
            placeholders = ','.join('?' * len(slot_ids))
            query += f' AND sl.time_slot_id IN ({placeholders})'
            params.extend(slot_ids)

        if zone_ids:
            placeholders = ','.join('?' * len(zone_ids))
            query += f' AND sl.zone_id IN ({placeholders})'
            params.extend(zone_ids)

        query += ' GROUP BY sl.zone_id, sl.time_slot_id ORDER BY sl.zone_id, sl.time_slot_id'

        cursor.execute(query, params)

        results = []
        for row in cursor.fetchall():
            total = row['total']
            if total > 0:
                results.append({
                    'zone_id': row['zone_id'],
                    'zone_name': row['zone_name'] or 'Unknown Zone',
                    'slot_id': row['time_slot_id'],
                    'slot_name': row['slot_name'],
                    'avg_db': round(row['avg_db'], 1),
                    'peak_db': round(row['peak_db'], 1),
                    'green_pct': round((row['green_count'] / total) * 100, 1),
                    'orange_pct': round((row['orange_count'] / total) * 100, 1),
                    'red_pct': round((row['red_count'] / total) * 100, 1),
                    'reading_count': total
                })

        return results


def get_period_aggregations(granularity, start_date, end_date, slot_ids=None, zone_ids=None, db_path=None):
    """
    Main function to get aggregated data for trends.

    Args:
        granularity: 'day', 'week', or 'month'
        start_date: Start date string (YYYY-MM-DD)
        end_date: End date string (YYYY-MM-DD)
        slot_ids: Optional list of time slot IDs to filter
        zone_ids: Optional list of zone IDs to filter
        db_path: Optional database path

    Returns:
        Dict with granularity, thresholds, and periods array
    """
    if db_path is None:
        db_path = get_db_path()

    thresholds = get_thresholds(db_path)
    period_boundaries = get_period_boundaries(granularity, start_date, end_date)

    periods = []
    for label, period_start, period_end in period_boundaries:
        data = aggregate_period(
            period_start, period_end, thresholds,
            slot_ids=slot_ids, zone_ids=zone_ids, db_path=db_path
        )
        # Only include periods that have data
        if data:
            periods.append({
                'label': label,
                'start': period_start,
                'end': period_end,
                'data': data
            })

    return {
        'granularity': granularity,
        'thresholds': thresholds,
        'periods': periods
    }
```

**Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_trends_service.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/services/trends_service.py backend/tests/test_trends_service.py
git commit -m "feat: add trends service with aggregation logic"
```

---

## Task 2: Add More Tests for Trends Service (Week/Month, Filters)

**Files:**
- Modify: `backend/tests/test_trends_service.py`

**Step 1: Write additional tests**

Add to `backend/tests/test_trends_service.py`:

```python
@pytest.fixture
def test_db_multiday():
    """Create a test database with data spanning multiple days and zones"""
    db_path = 'test_trends_multi.db'
    os.environ['DATABASE_PATH'] = db_path
    init_db(db_path)

    cet = pytz.timezone('Europe/Paris')
    with get_db_context(db_path) as conn:
        cursor = conn.cursor()

        cursor.execute(
            "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)",
            ('thresholds', '{"orange_threshold": 60, "red_threshold": 80}')
        )

        # Insert data for multiple days, zones, slots
        test_data = [
            # Day 1 (Mon Jan 6), Zone 1, Slot 1
            (cet.localize(datetime(2026, 1, 6, 11, 35, 0)).isoformat(), 55.0, 1, 1),
            (cet.localize(datetime(2026, 1, 6, 11, 45, 0)).isoformat(), 60.0, 1, 1),
            # Day 1, Zone 1, Slot 2
            (cet.localize(datetime(2026, 1, 6, 12, 15, 0)).isoformat(), 70.0, 2, 1),
            # Day 1, Zone 2, Slot 1
            (cet.localize(datetime(2026, 1, 6, 11, 40, 0)).isoformat(), 65.0, 1, 2),
            # Day 2 (Tue Jan 7), Zone 1, Slot 1
            (cet.localize(datetime(2026, 1, 7, 11, 35, 0)).isoformat(), 58.0, 1, 1),
            (cet.localize(datetime(2026, 1, 7, 11, 45, 0)).isoformat(), 62.0, 1, 1),
            # Day 8 (Mon Jan 13) - second week, Zone 1, Slot 1
            (cet.localize(datetime(2026, 1, 13, 11, 35, 0)).isoformat(), 52.0, 1, 1),
        ]

        for ts, db, slot, zone in test_data:
            cursor.execute(
                'INSERT INTO sound_logs (timestamp, decibels, time_slot_id, zone_id) VALUES (?, ?, ?, ?)',
                (ts, db, slot, zone)
            )
        conn.commit()

    yield db_path

    if os.path.exists(db_path):
        os.remove(db_path)


def test_get_period_aggregations_multiple_days(test_db_multiday):
    """Test aggregation across multiple days"""
    result = get_period_aggregations(
        granularity='day',
        start_date='2026-01-06',
        end_date='2026-01-07',
        db_path=test_db_multiday
    )

    assert len(result['periods']) == 2  # Two days with data
    assert result['periods'][0]['start'] == '2026-01-06'
    assert result['periods'][1]['start'] == '2026-01-07'


def test_get_period_aggregations_week(test_db_multiday):
    """Test weekly aggregation"""
    result = get_period_aggregations(
        granularity='week',
        start_date='2026-01-06',
        end_date='2026-01-13',
        db_path=test_db_multiday
    )

    assert result['granularity'] == 'week'
    assert len(result['periods']) == 2  # Two weeks


def test_get_period_aggregations_with_zone_filter(test_db_multiday):
    """Test filtering by zone"""
    result = get_period_aggregations(
        granularity='day',
        start_date='2026-01-06',
        end_date='2026-01-06',
        zone_ids=[1],
        db_path=test_db_multiday
    )

    # Should only have zone 1 data
    for period in result['periods']:
        for data in period['data']:
            assert data['zone_id'] == 1


def test_get_period_aggregations_with_slot_filter(test_db_multiday):
    """Test filtering by time slot"""
    result = get_period_aggregations(
        granularity='day',
        start_date='2026-01-06',
        end_date='2026-01-06',
        slot_ids=[1],
        db_path=test_db_multiday
    )

    # Should only have slot 1 data
    for period in result['periods']:
        for data in period['data']:
            assert data['slot_id'] == 1
```

**Step 2: Run tests**

Run: `cd backend && python -m pytest tests/test_trends_service.py -v`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add backend/tests/test_trends_service.py
git commit -m "test: add comprehensive tests for trends service"
```

---

## Task 3: Create Trends API Route

**Files:**
- Create: `backend/routes/trends.py`
- Modify: `backend/app.py`
- Test: `backend/tests/test_trends_api.py`

**Step 1: Write the failing test**

Create `backend/tests/test_trends_api.py`:

```python
import pytest
import json
import os
import sys
from datetime import datetime
import pytz

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from database import init_db, get_db_context


@pytest.fixture
def client():
    app.config['TESTING'] = True
    db_path = 'test_trends_api.db'
    os.environ['DATABASE_PATH'] = db_path

    init_db(db_path)

    # Insert test data
    cet = pytz.timezone('Europe/Paris')
    with get_db_context(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)",
            ('thresholds', '{"orange_threshold": 60, "red_threshold": 80}')
        )

        test_logs = [
            (cet.localize(datetime(2026, 1, 6, 11, 35, 0)).isoformat(), 55.0, 1, 1),
            (cet.localize(datetime(2026, 1, 6, 11, 45, 0)).isoformat(), 65.0, 1, 1),
            (cet.localize(datetime(2026, 1, 6, 11, 55, 0)).isoformat(), 85.0, 1, 1),
        ]

        for ts, db, slot, zone in test_logs:
            cursor.execute(
                'INSERT INTO sound_logs (timestamp, decibels, time_slot_id, zone_id) VALUES (?, ?, ?, ?)',
                (ts, db, slot, zone)
            )
        conn.commit()

    with app.test_client() as client:
        yield client

    if os.path.exists(db_path):
        os.remove(db_path)


def test_get_trends_day(client):
    """Test GET /api/trends with day granularity"""
    response = client.get('/api/trends?granularity=day&start_date=2026-01-06&end_date=2026-01-06')

    assert response.status_code == 200
    data = json.loads(response.data)

    assert data['granularity'] == 'day'
    assert 'thresholds' in data
    assert 'periods' in data
    assert len(data['periods']) == 1


def test_get_trends_missing_params(client):
    """Test GET /api/trends with missing parameters"""
    response = client.get('/api/trends?granularity=day')

    assert response.status_code == 400
    data = json.loads(response.data)
    assert 'error' in data


def test_get_trends_invalid_granularity(client):
    """Test GET /api/trends with invalid granularity"""
    response = client.get('/api/trends?granularity=invalid&start_date=2026-01-06&end_date=2026-01-06')

    assert response.status_code == 400


def test_get_trends_with_filters(client):
    """Test GET /api/trends with slot and zone filters"""
    response = client.get('/api/trends?granularity=day&start_date=2026-01-06&end_date=2026-01-06&slots=1&zones=1')

    assert response.status_code == 200
    data = json.loads(response.data)
    assert len(data['periods']) == 1
```

**Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_trends_api.py -v`
Expected: FAIL with 404 (route not registered)

**Step 3: Write the route implementation**

Create `backend/routes/trends.py`:

```python
from flask import Blueprint, jsonify, request
from services.trends_service import get_period_aggregations

trends_bp = Blueprint('trends', __name__)


@trends_bp.route('/api/trends', methods=['GET'])
def get_trends():
    """
    Get aggregated trends data.

    Query parameters:
    - granularity: 'day', 'week', or 'month' (required)
    - start_date: Start date YYYY-MM-DD (required)
    - end_date: End date YYYY-MM-DD (required)
    - slots: Comma-separated slot IDs (optional)
    - zones: Comma-separated zone IDs (optional)
    """
    granularity = request.args.get('granularity')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    slots_str = request.args.get('slots')
    zones_str = request.args.get('zones')

    # Validate required parameters
    if not granularity:
        return jsonify({'error': 'granularity parameter is required'}), 400
    if granularity not in ('day', 'week', 'month'):
        return jsonify({'error': 'granularity must be day, week, or month'}), 400
    if not start_date:
        return jsonify({'error': 'start_date parameter is required'}), 400
    if not end_date:
        return jsonify({'error': 'end_date parameter is required'}), 400

    # Parse optional filters
    slot_ids = None
    if slots_str:
        try:
            slot_ids = [int(s.strip()) for s in slots_str.split(',')]
        except ValueError:
            return jsonify({'error': 'Invalid slots parameter'}), 400

    zone_ids = None
    if zones_str:
        try:
            zone_ids = [int(z.strip()) for z in zones_str.split(',')]
        except ValueError:
            return jsonify({'error': 'Invalid zones parameter'}), 400

    try:
        result = get_period_aggregations(
            granularity=granularity,
            start_date=start_date,
            end_date=end_date,
            slot_ids=slot_ids,
            zone_ids=zone_ids
        )
        return jsonify(result), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

**Step 4: Register the blueprint**

Modify `backend/app.py` - add after line 18:

```python
from routes.trends import trends_bp
app.register_blueprint(trends_bp)
```

**Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_trends_api.py -v`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add backend/routes/trends.py backend/tests/test_trends_api.py backend/app.py
git commit -m "feat: add /api/trends endpoint"
```

---

## Task 4: Add getTrends to Frontend API Service

**Files:**
- Modify: `frontend/src/services/api.js`

**Step 1: Add the getTrends method**

Add to `frontend/src/services/api.js` before the closing brace:

```javascript
  // Get trends data
  getTrends: async (granularity, startDate, endDate, slots = null, zones = null) => {
    try {
      let url = `/api/trends?granularity=${granularity}&start_date=${startDate}&end_date=${endDate}`;
      if (slots && slots.length > 0) {
        url += `&slots=${slots.join(',')}`;
      }
      if (zones && zones.length > 0) {
        url += `&zones=${zones.join(',')}`;
      }
      const response = await api.get(url);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
```

**Step 2: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add frontend/src/services/api.js
git commit -m "feat: add getTrends method to frontend API service"
```

---

## Task 5: Create TrendsCharts Component

**Files:**
- Create: `frontend/src/components/charts/TrendsCharts.js`

**Step 1: Create the chart components**

Create `frontend/src/components/charts/TrendsCharts.js`:

```javascript
import React from 'react';
import { Bar, Line } from 'react-chartjs-2';

// Color palette for different periods
const periodColors = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
  '#06b6d4', '#84cc16', '#f43f5e', '#6366f1', '#14b8a6'
];

/**
 * Helper to get color based on dB value and thresholds
 */
const getZoneColor = (value, thresholds) => {
  if (value <= thresholds.orange) return '#22c55e';
  if (value <= thresholds.red) return '#f97316';
  return '#ef4444';
};

/**
 * Average dB Bar Chart - compares average across periods
 */
export const TrendsAverageChart = ({ trendsData, selectedZone, selectedSlot }) => {
  if (!trendsData?.periods?.length) {
    return <div className="text-gray-600 text-center py-8">No data available</div>;
  }

  const labels = [];
  const values = [];
  const colors = [];

  trendsData.periods.forEach(period => {
    const matchingData = period.data.find(
      d => d.zone_id === selectedZone && d.slot_id === selectedSlot
    );
    if (matchingData) {
      labels.push(period.label);
      values.push(matchingData.avg_db);
      colors.push(getZoneColor(matchingData.avg_db, trendsData.thresholds));
    }
  });

  const data = {
    labels,
    datasets: [{
      label: 'Average dB',
      data: values,
      backgroundColor: colors
    }]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { min: 0, max: 100, title: { display: true, text: 'Decibels (dB)' } }
    },
    plugins: {
      legend: { display: false },
      title: { display: true, text: 'Average Sound Level', font: { size: 18 } }
    }
  };

  return <div style={{ height: '400px' }}><Bar data={data} options={options} /></div>;
};

/**
 * Peak dB Bar Chart - compares peak values across periods
 */
export const TrendsPeakChart = ({ trendsData, selectedZone, selectedSlot }) => {
  if (!trendsData?.periods?.length) {
    return <div className="text-gray-600 text-center py-8">No data available</div>;
  }

  const labels = [];
  const values = [];
  const colors = [];

  trendsData.periods.forEach(period => {
    const matchingData = period.data.find(
      d => d.zone_id === selectedZone && d.slot_id === selectedSlot
    );
    if (matchingData) {
      labels.push(period.label);
      values.push(matchingData.peak_db);
      colors.push(getZoneColor(matchingData.peak_db, trendsData.thresholds));
    }
  });

  const data = {
    labels,
    datasets: [{
      label: 'Peak dB',
      data: values,
      backgroundColor: colors
    }]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { min: 0, max: 120, title: { display: true, text: 'Decibels (dB)' } }
    },
    plugins: {
      legend: { display: false },
      title: { display: true, text: 'Peak Sound Level', font: { size: 18 } }
    }
  };

  return <div style={{ height: '400px' }}><Bar data={data} options={options} /></div>;
};

/**
 * Zone Time Percentage Stacked Bar Chart
 */
export const TrendsZoneTimeChart = ({ trendsData, selectedZone, selectedSlot }) => {
  if (!trendsData?.periods?.length) {
    return <div className="text-gray-600 text-center py-8">No data available</div>;
  }

  const labels = [];
  const greenData = [];
  const orangeData = [];
  const redData = [];

  trendsData.periods.forEach(period => {
    const matchingData = period.data.find(
      d => d.zone_id === selectedZone && d.slot_id === selectedSlot
    );
    if (matchingData) {
      labels.push(period.label);
      greenData.push(matchingData.green_pct);
      orangeData.push(matchingData.orange_pct);
      redData.push(matchingData.red_pct);
    }
  });

  const data = {
    labels,
    datasets: [
      { label: 'Quiet (Green)', data: greenData, backgroundColor: '#22c55e' },
      { label: 'Moderate (Orange)', data: orangeData, backgroundColor: '#f97316' },
      { label: 'Too Loud (Red)', data: redData, backgroundColor: '#ef4444' }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { stacked: true },
      y: { stacked: true, min: 0, max: 100, title: { display: true, text: 'Percentage (%)' } }
    },
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: 'Time in Each Noise Level', font: { size: 18 } }
    }
  };

  return <div style={{ height: '400px' }}><Bar data={data} options={options} /></div>;
};

/**
 * Trend Line Chart - shows average over time
 */
export const TrendLineChart = ({ trendsData, selectedZone, selectedSlot }) => {
  if (!trendsData?.periods?.length) {
    return <div className="text-gray-600 text-center py-8">No data available</div>;
  }

  const labels = [];
  const values = [];

  trendsData.periods.forEach(period => {
    const matchingData = period.data.find(
      d => d.zone_id === selectedZone && d.slot_id === selectedSlot
    );
    if (matchingData) {
      labels.push(period.label);
      values.push(matchingData.avg_db);
    }
  });

  const data = {
    labels,
    datasets: [{
      label: 'Average dB',
      data: values,
      borderColor: '#3b82f6',
      backgroundColor: '#3b82f620',
      tension: 0.3,
      fill: true
    }]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { min: 0, max: 100, title: { display: true, text: 'Decibels (dB)' } }
    },
    plugins: {
      legend: { display: false },
      title: { display: true, text: 'Trend Over Time', font: { size: 18 } }
    }
  };

  return <div style={{ height: '400px' }}><Line data={data} options={options} /></div>;
};

/**
 * Multi-series charts for comparing all zones or all slots
 */
export const TrendsMultiSeriesChart = ({ trendsData, mode, selectedZone, selectedSlot, config }) => {
  if (!trendsData?.periods?.length) {
    return <div className="text-gray-600 text-center py-8">No data available</div>;
  }

  const labels = trendsData.periods.map(p => p.label);
  const datasets = [];

  if (mode === 'allSlots' && selectedZone) {
    // Show all slots for selected zone
    const slotIds = [...new Set(trendsData.periods.flatMap(p => p.data.map(d => d.slot_id)))];
    slotIds.forEach((slotId, index) => {
      const slotData = trendsData.periods.map(period => {
        const match = period.data.find(d => d.zone_id === selectedZone && d.slot_id === slotId);
        return match ? match.avg_db : null;
      });
      const slotName = config.time_slots?.find(s => s.id === slotId)?.name || `Period ${slotId}`;
      datasets.push({
        label: slotName,
        data: slotData,
        borderColor: periodColors[index % periodColors.length],
        backgroundColor: periodColors[index % periodColors.length] + '20',
        tension: 0.3
      });
    });
  } else if (mode === 'allZones' && selectedSlot) {
    // Show all zones for selected slot
    const zoneIds = [...new Set(trendsData.periods.flatMap(p => p.data.map(d => d.zone_id)))];
    zoneIds.forEach((zoneId, index) => {
      const zoneData = trendsData.periods.map(period => {
        const match = period.data.find(d => d.zone_id === zoneId && d.slot_id === selectedSlot);
        return match ? match.avg_db : null;
      });
      const zoneName = config.zones?.find(z => z.id === zoneId)?.name || `Zone ${zoneId}`;
      datasets.push({
        label: zoneName,
        data: zoneData,
        borderColor: periodColors[index % periodColors.length],
        backgroundColor: periodColors[index % periodColors.length] + '20',
        tension: 0.3
      });
    });
  }

  const data = { labels, datasets };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { min: 0, max: 100, title: { display: true, text: 'Average dB' } }
    },
    plugins: {
      legend: { position: 'top' },
      title: {
        display: true,
        text: mode === 'allSlots' ? 'Compare Periods' : 'Compare Zones',
        font: { size: 18 }
      }
    }
  };

  return <div style={{ height: '400px' }}><Line data={data} options={options} /></div>;
};
```

**Step 2: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add frontend/src/components/charts/TrendsCharts.js
git commit -m "feat: add TrendsCharts component with four chart types"
```

---

## Task 6: Create TrendsView Component

**Files:**
- Create: `frontend/src/components/TrendsView.js`

**Step 1: Create the TrendsView component**

Create `frontend/src/components/TrendsView.js`:

```javascript
import React, { useState, useEffect, useMemo } from 'react';
import { apiService } from '../services/api';
import {
  TrendsAverageChart,
  TrendsPeakChart,
  TrendsZoneTimeChart,
  TrendLineChart,
  TrendsMultiSeriesChart
} from './charts/TrendsCharts';

const TrendsView = ({ config }) => {
  // Granularity: day, week, month
  const [granularity, setGranularity] = useState('day');

  // Date range
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Filters
  const [selectedZone, setSelectedZone] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [compareMode, setCompareMode] = useState('single'); // single, allSlots, allZones

  // Data
  const [trendsData, setTrendsData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Active chart
  const [activeChart, setActiveChart] = useState('average');

  // Initialize zone and slot from config
  useEffect(() => {
    if (config.zones?.length > 0 && selectedZone === null) {
      setSelectedZone(config.zones[0].id);
    }
    if (config.time_slots?.length > 0 && selectedSlot === null) {
      setSelectedSlot(config.time_slots[0].id);
    }
  }, [config]);

  // Load data when filters change
  useEffect(() => {
    if (startDate && endDate) {
      loadTrends();
    }
  }, [granularity, startDate, endDate]);

  const loadTrends = async () => {
    setLoading(true);
    const result = await apiService.getTrends(granularity, startDate, endDate);
    if (result.success) {
      setTrendsData(result.data);
    }
    setLoading(false);
  };

  // Preset handlers
  const applyPreset = (preset) => {
    const today = new Date();
    let start;

    switch (preset) {
      case 'last7days':
        start = new Date(today);
        start.setDate(start.getDate() - 6);
        setGranularity('day');
        break;
      case 'last4weeks':
        start = new Date(today);
        start.setDate(start.getDate() - 27);
        setGranularity('week');
        break;
      case 'last3months':
        start = new Date(today);
        start.setMonth(start.getMonth() - 2);
        start.setDate(1);
        setGranularity('month');
        break;
      default:
        return;
    }

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(today.toISOString().split('T')[0]);
  };

  // Available zones and slots from data
  const availableZones = useMemo(() => {
    if (!trendsData?.periods?.length) return [];
    const zoneIds = new Set();
    trendsData.periods.forEach(p => p.data.forEach(d => zoneIds.add(d.zone_id)));
    return config.zones?.filter(z => zoneIds.has(z.id)) || [];
  }, [trendsData, config.zones]);

  const availableSlots = useMemo(() => {
    if (!trendsData?.periods?.length) return [];
    const slotIds = new Set();
    trendsData.periods.forEach(p => p.data.forEach(d => slotIds.add(d.slot_id)));
    return config.time_slots?.filter(s => slotIds.has(s.id)) || [];
  }, [trendsData, config.time_slots]);

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-6xl w-full">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Trends</h2>

      {/* Granularity Tabs */}
      <div className="flex gap-2 mb-6">
        {['day', 'week', 'month'].map(g => (
          <button
            key={g}
            onClick={() => setGranularity(g)}
            className={`px-6 py-2 rounded-lg font-medium capitalize ${
              granularity === g
                ? 'bg-asv-blue text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Presets and Date Range */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => applyPreset('last7days')}
            className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
          >
            Last 7 Days
          </button>
          <button
            onClick={() => applyPreset('last4weeks')}
            className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
          >
            Last 4 Weeks
          </button>
          <button
            onClick={() => applyPreset('last3months')}
            className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
          >
            Last 3 Months
          </button>
        </div>

        <div className="flex flex-wrap gap-4 items-center">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Zone and Slot Selection */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Zone</label>
          <select
            value={selectedZone || ''}
            onChange={(e) => setSelectedZone(Number(e.target.value))}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
          >
            {availableZones.map(zone => (
              <option key={zone.id} value={zone.id}>{zone.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Time Period</label>
          <select
            value={selectedSlot || ''}
            onChange={(e) => setSelectedSlot(Number(e.target.value))}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
          >
            {availableSlots.map(slot => (
              <option key={slot.id} value={slot.id}>{slot.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Compare Mode</label>
          <select
            value={compareMode}
            onChange={(e) => setCompareMode(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
          >
            <option value="single">Single Zone & Period</option>
            <option value="allSlots">All Periods (same zone)</option>
            <option value="allZones">All Zones (same period)</option>
          </select>
        </div>
      </div>

      {/* Chart Type Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {[
          { key: 'average', label: 'Average' },
          { key: 'peak', label: 'Peak' },
          { key: 'zonetime', label: 'Zone Time %' },
          { key: 'trend', label: 'Trend Line' }
        ].map(chart => (
          <button
            key={chart.key}
            onClick={() => setActiveChart(chart.key)}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap ${
              activeChart === chart.key
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {chart.label}
          </button>
        ))}
      </div>

      {/* Chart Display */}
      <div className="bg-gray-50 rounded-lg p-4">
        {loading ? (
          <div className="text-center py-20 text-gray-600">Loading data...</div>
        ) : !trendsData?.periods?.length ? (
          <div className="text-center py-20 text-gray-600">
            No data available for the selected date range
          </div>
        ) : compareMode !== 'single' ? (
          <TrendsMultiSeriesChart
            trendsData={trendsData}
            mode={compareMode}
            selectedZone={selectedZone}
            selectedSlot={selectedSlot}
            config={config}
          />
        ) : (
          <>
            {activeChart === 'average' && (
              <TrendsAverageChart
                trendsData={trendsData}
                selectedZone={selectedZone}
                selectedSlot={selectedSlot}
              />
            )}
            {activeChart === 'peak' && (
              <TrendsPeakChart
                trendsData={trendsData}
                selectedZone={selectedZone}
                selectedSlot={selectedSlot}
              />
            )}
            {activeChart === 'zonetime' && (
              <TrendsZoneTimeChart
                trendsData={trendsData}
                selectedZone={selectedZone}
                selectedSlot={selectedSlot}
              />
            )}
            {activeChart === 'trend' && (
              <TrendLineChart
                trendsData={trendsData}
                selectedZone={selectedZone}
                selectedSlot={selectedSlot}
              />
            )}
          </>
        )}
      </div>

      {/* Data Summary */}
      {trendsData?.periods?.length > 0 && (
        <div className="mt-6 bg-blue-50 rounded-lg p-4">
          <p className="text-sm text-gray-700">
            Showing <strong>{trendsData.periods.length}</strong> {granularity}(s) of data
          </p>
        </div>
      )}
    </div>
  );
};

export default TrendsView;
```

**Step 2: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add frontend/src/components/TrendsView.js
git commit -m "feat: add TrendsView component with filters and presets"
```

---

## Task 7: Add Trends Tab to App Navigation

**Files:**
- Modify: `frontend/src/App.js`

**Step 1: Import TrendsView**

Add after line 5 in `frontend/src/App.js`:

```javascript
import TrendsView from './components/TrendsView';
```

**Step 2: Add Trends button to navigation**

Find the navigation buttons section (around line 190-210). After the "Logs" button and before the closing `</div>` of the navigation, add:

```javascript
          <button
            onClick={() => setActiveTab('trends')}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
              activeTab === 'trends'
                ? 'bg-asv-blue text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            Trends
          </button>
```

**Step 3: Add TrendsView to tab content**

Find the tab content section (around line 220-230). After the LogsViewer conditional and before the closing `</div>`, add:

```javascript
          {activeTab === 'trends' && (
            <TrendsView config={config} />
          )}
```

**Step 4: Verify frontend builds and runs**

Run: `cd frontend && npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add frontend/src/App.js
git commit -m "feat: add Trends tab to app navigation"
```

---

## Task 8: Run Full Test Suite and Manual Verification

**Step 1: Run backend tests**

Run: `cd backend && python -m pytest -v`
Expected: All tests PASS

**Step 2: Run frontend build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

**Step 3: Manual verification checklist**

Start the app and verify:
- [ ] Trends tab appears in navigation
- [ ] Day/Week/Month granularity tabs work
- [ ] Preset buttons (Last 7 Days, etc.) update date range
- [ ] Custom date range picker works
- [ ] Zone and Period dropdowns populate from data
- [ ] All four chart types render correctly
- [ ] Compare Mode toggles work (single, all slots, all zones)
- [ ] Loading state shows while fetching
- [ ] Empty state shows when no data

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete trends comparison feature implementation"
```

---

## Summary

This plan implements the Trends feature in 8 tasks:

1. **Trends Service** - Backend aggregation logic with tests
2. **Service Tests** - Comprehensive test coverage for week/month/filters
3. **Trends API Route** - `/api/trends` endpoint with validation
4. **Frontend API** - `getTrends()` method in api.js
5. **TrendsCharts** - Four chart components for visualization
6. **TrendsView** - Main container with filters, presets, and charts
7. **App Navigation** - Add Trends tab to main app
8. **Verification** - Full test suite and manual testing
