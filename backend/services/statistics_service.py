from database import get_db_context
from datetime import datetime
import os
import json


def get_zone_from_db(db_value, orange_threshold=60, red_threshold=80):
    """
    Determine zone color based on decibel value

    Args:
        db_value: Decibel reading
        orange_threshold: Threshold for yellow/orange zone
        red_threshold: Threshold for red zone

    Returns:
        'green', 'yellow', or 'red'
    """
    if db_value >= red_threshold:
        return 'red'
    elif db_value >= orange_threshold:
        return 'yellow'
    else:
        return 'green'


def get_period_statistics(time_slot_id: int, current_time: datetime, db_path: str = None) -> dict:
    """
    Calculate statistics for the current time slot up to current_time

    Args:
        time_slot_id: ID of the time slot
        current_time: Current timestamp (timezone-aware)
        db_path: Optional path to database file

    Returns:
        Dict with statistics or None if no data
        {
            'peak_db': float,
            'peak_timestamp': str,
            'average_db': float,
            'green_percent': float,
            'yellow_percent': float,
            'red_percent': float,
            'recent_readings': list of dicts
        }
    """
    if db_path is None:
        db_path = os.getenv('DATABASE_PATH', 'soundmeter.db')

    with get_db_context(db_path) as conn:
        cursor = conn.cursor()

        # Get thresholds from config
        cursor.execute("SELECT value FROM config WHERE key = 'thresholds'")
        thresholds_row = cursor.fetchone()
        if thresholds_row:
            thresholds = json.loads(thresholds_row['value'])
            orange_threshold = thresholds.get('orange_threshold', 60)
            red_threshold = thresholds.get('red_threshold', 80)
        else:
            orange_threshold = 60
            red_threshold = 80

        # Get time slot info
        cursor.execute(
            'SELECT start_time, end_time FROM time_slots WHERE id = ?',
            (time_slot_id,)
        )
        slot_row = cursor.fetchone()
        if not slot_row:
            return None

        # Get all readings for this time slot up to current time
        current_date_str = current_time.strftime('%Y-%m-%d')
        cursor.execute(
            '''
            SELECT decibels, timestamp
            FROM sound_logs
            WHERE time_slot_id = ?
            AND date(timestamp) = ?
            AND timestamp <= ?
            ORDER BY timestamp ASC
            ''',
            (time_slot_id, current_date_str, current_time)
        )
        readings = cursor.fetchall()

        if not readings:
            return None

        # Calculate statistics
        db_values = [row['decibels'] for row in readings]
        peak_db = max(db_values)
        average_db = sum(db_values) / len(db_values)

        # Find peak timestamp
        peak_row = max(readings, key=lambda r: r['decibels'])
        peak_timestamp_dt = datetime.fromisoformat(peak_row['timestamp'])
        peak_timestamp = peak_timestamp_dt.strftime('%H:%M:%S')

        # Calculate zone percentages
        zones = [get_zone_from_db(db, orange_threshold, red_threshold) for db in db_values]
        total = len(zones)
        green_percent = (zones.count('green') / total) * 100
        yellow_percent = (zones.count('yellow') / total) * 100
        red_percent = (zones.count('red') / total) * 100

        # Get recent readings (last 5)
        recent_readings = get_recent_readings(
            time_slot_id=time_slot_id,
            current_time=current_time,
            limit=5,
            db_path=db_path
        )

        return {
            'peak_db': peak_db,
            'peak_timestamp': peak_timestamp,
            'average_db': round(average_db, 1),
            'green_percent': round(green_percent, 1),
            'yellow_percent': round(yellow_percent, 1),
            'red_percent': round(red_percent, 1),
            'recent_readings': recent_readings
        }


def get_recent_readings(time_slot_id: int, current_time: datetime, limit: int = 5, db_path: str = None) -> list:
    """
    Get recent sound readings for the current time slot

    Args:
        time_slot_id: ID of the time slot
        current_time: Current timestamp (timezone-aware)
        limit: Maximum number of readings to return
        db_path: Optional path to database file

    Returns:
        List of dicts with recent readings (most recent first)
        [
            {'timestamp': str, 'db': float, 'zone': str},
            ...
        ]
    """
    if db_path is None:
        db_path = os.getenv('DATABASE_PATH', 'soundmeter.db')

    with get_db_context(db_path) as conn:
        cursor = conn.cursor()

        # Get thresholds from config
        cursor.execute("SELECT value FROM config WHERE key = 'thresholds'")
        thresholds_row = cursor.fetchone()
        if thresholds_row:
            thresholds = json.loads(thresholds_row['value'])
            orange_threshold = thresholds.get('orange_threshold', 60)
            red_threshold = thresholds.get('red_threshold', 80)
        else:
            orange_threshold = 60
            red_threshold = 80

        # Get recent readings for this time slot up to current time
        current_date_str = current_time.strftime('%Y-%m-%d')
        cursor.execute(
            '''
            SELECT decibels, timestamp
            FROM sound_logs
            WHERE time_slot_id = ?
            AND date(timestamp) = ?
            AND timestamp <= ?
            ORDER BY timestamp DESC
            LIMIT ?
            ''',
            (time_slot_id, current_date_str, current_time, limit)
        )
        readings = cursor.fetchall()

        result = []
        for row in readings:
            timestamp_dt = datetime.fromisoformat(row['timestamp'])
            result.append({
                'timestamp': timestamp_dt.strftime('%H:%M:%S'),
                'db': row['decibels'],
                'zone': get_zone_from_db(row['decibels'], orange_threshold, red_threshold)
            })

        return result
