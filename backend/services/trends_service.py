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
                SUM(CASE WHEN sl.decibels < ? THEN 1 ELSE 0 END) as green_count,
                SUM(CASE WHEN sl.decibels >= ? AND sl.decibels < ? THEN 1 ELSE 0 END) as orange_count,
                SUM(CASE WHEN sl.decibels >= ? THEN 1 ELSE 0 END) as red_count
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
