from flask import Blueprint, jsonify, request
from datetime import datetime
import pytz
from database import get_db_context
import os

logs_bp = Blueprint('logs', __name__)

def get_db_path():
    return os.getenv('DATABASE_PATH', 'soundmeter.db')

def get_timezone():
    return pytz.timezone(os.getenv('TIMEZONE', 'Europe/Paris'))

def is_within_recording_hours(dt):
    """Check if datetime is within 11:30-13:30"""
    time = dt.time()
    start = datetime.strptime('11:30:00', '%H:%M:%S').time()
    end = datetime.strptime('13:30:00', '%H:%M:%S').time()
    return start <= time <= end

def get_time_slot_id(dt):
    """Determine which time slot (1-4) the datetime falls into"""
    time = dt.time()

    if datetime.strptime('11:30:00', '%H:%M:%S').time() <= time < datetime.strptime('12:00:00', '%H:%M:%S').time():
        return 1
    elif datetime.strptime('12:00:00', '%H:%M:%S').time() <= time < datetime.strptime('12:30:00', '%H:%M:%S').time():
        return 2
    elif datetime.strptime('12:30:00', '%H:%M:%S').time() <= time < datetime.strptime('13:00:00', '%H:%M:%S').time():
        return 3
    elif datetime.strptime('13:00:00', '%H:%M:%S').time() <= time <= datetime.strptime('13:30:00', '%H:%M:%S').time():
        return 4
    return None

@logs_bp.route('/api/logs', methods=['POST'])
def create_log():
    """Create a new sound log entry"""
    data = request.get_json()

    if not data or 'timestamp' not in data or 'decibels' not in data:
        return jsonify({"success": False, "message": "Missing required fields"}), 400

    try:
        # Parse timestamp
        timestamp_str = data['timestamp']
        timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))

        # Convert to CET
        cet = get_timezone()
        if timestamp.tzinfo is None:
            timestamp = cet.localize(timestamp)
        else:
            timestamp = timestamp.astimezone(cet)

        # Validate recording hours
        if not is_within_recording_hours(timestamp):
            return jsonify({
                "success": False,
                "message": "Timestamp outside recording hours (11:30-13:30 CET)"
            }), 400

        # Validate decibels range
        decibels = float(data['decibels'])
        if not 0 <= decibels <= 120:
            return jsonify({
                "success": False,
                "message": "Decibels must be between 0 and 120"
            }), 400

        # Get time slot
        time_slot_id = get_time_slot_id(timestamp)
        if time_slot_id is None:
            return jsonify({
                "success": False,
                "message": "Could not determine time slot"
            }), 400

        # Save to database
        with get_db_context(get_db_path()) as conn:
            cursor = conn.cursor()
            cursor.execute(
                'INSERT INTO sound_logs (timestamp, decibels, time_slot_id) VALUES (?, ?, ?)',
                (timestamp.isoformat(), decibels, time_slot_id)
            )
            conn.commit()

        return jsonify({"success": True, "message": "Log saved"}), 200

    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@logs_bp.route('/api/logs', methods=['GET'])
def get_logs():
    """Get sound logs filtered by date and time slots"""
    date_str = request.args.get('date')
    slots_str = request.args.get('slots', '1,2,3,4')

    if not date_str:
        return jsonify({"error": "Date parameter required"}), 400

    try:
        # Parse date
        date = datetime.strptime(date_str, '%Y-%m-%d').date()

        # Parse slots
        slot_ids = [int(s.strip()) for s in slots_str.split(',')]

        # Query database
        with get_db_context(get_db_path()) as conn:
            cursor = conn.cursor()

            placeholders = ','.join('?' * len(slot_ids))
            query = f'''
                SELECT
                    sl.id,
                    sl.timestamp,
                    sl.decibels,
                    sl.time_slot_id,
                    ts.name as slot_name
                FROM sound_logs sl
                JOIN time_slots ts ON sl.time_slot_id = ts.id
                WHERE DATE(sl.timestamp) = ?
                AND sl.time_slot_id IN ({placeholders})
                ORDER BY sl.timestamp
            '''

            cursor.execute(query, [date.isoformat()] + slot_ids)

            logs = []
            for row in cursor.fetchall():
                logs.append({
                    'id': row['id'],
                    'timestamp': row['timestamp'],
                    'decibels': row['decibels'],
                    'time_slot_id': row['time_slot_id'],
                    'slot_name': row['slot_name']
                })

        return jsonify(logs), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500
