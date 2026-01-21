from flask import Blueprint, jsonify, request
import json
from database import get_db_context
import os

config_bp = Blueprint('config', __name__)

def get_db_path():
    return os.getenv('DATABASE_PATH', 'soundmeter.db')

@config_bp.route('/api/config', methods=['GET'])
def get_config():
    """Get current configuration"""
    with get_db_context(get_db_path()) as conn:
        cursor = conn.cursor()

        # Get thresholds, visual update rate, and calibration offset
        cursor.execute('SELECT key, value FROM config')
        config_data = {
            'calibration_offset': 0  # Default value if not in DB
        }
        rows = cursor.fetchall()
        print(f"Config rows from DB: {[(row['key'], row['value']) for row in rows]}")
        for row in rows:
            if row['key'] == 'thresholds':
                config_data['thresholds'] = json.loads(row['value'])
            elif row['key'] == 'visual_update_rate':
                config_data['visual_update_rate'] = int(row['value'])
            elif row['key'] == 'calibration_offset':
                print(f"Found calibration_offset in DB: {row['value']}")
                config_data['calibration_offset'] = float(row['value'])
        print(f"Returning config_data: {config_data}")

        # Get time slots
        cursor.execute('SELECT id, start_time, end_time, name FROM time_slots ORDER BY id')
        time_slots = []
        for row in cursor.fetchall():
            time_slots.append({
                'id': row['id'],
                'start_time': row['start_time'],
                'end_time': row['end_time'],
                'name': row['name']
            })

        config_data['time_slots'] = time_slots

        # Get zones
        cursor.execute('SELECT id, name FROM zones ORDER BY id')
        zones = []
        for row in cursor.fetchall():
            zones.append({
                'id': row['id'],
                'name': row['name']
            })

        config_data['zones'] = zones

    return jsonify(config_data), 200

@config_bp.route('/api/config', methods=['POST'])
def update_config():
    """Update configuration"""
    data = request.get_json()

    if not data:
        return jsonify({"error": "No data provided"}), 400

    with get_db_context(get_db_path()) as conn:
        cursor = conn.cursor()

        # Update thresholds if provided
        if 'thresholds' in data:
            cursor.execute(
                'UPDATE config SET value = ? WHERE key = ?',
                (json.dumps(data['thresholds']), 'thresholds')
            )

        # Update visual update rate if provided
        if 'visual_update_rate' in data:
            cursor.execute(
                'UPDATE config SET value = ? WHERE key = ?',
                (str(data['visual_update_rate']), 'visual_update_rate')
            )

        # Update calibration offset if provided (use INSERT OR REPLACE for new DBs)
        if 'calibration_offset' in data:
            print(f"Saving calibration_offset: {data['calibration_offset']}")
            cursor.execute(
                'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
                ('calibration_offset', str(data['calibration_offset']))
            )
            # Verify it was saved
            cursor.execute('SELECT value FROM config WHERE key = ?', ('calibration_offset',))
            row = cursor.fetchone()
            print(f"After INSERT, calibration_offset in DB: {row['value'] if row else 'NOT FOUND'}")

        # Update time slot names if provided
        if 'time_slots' in data:
            for slot in data['time_slots']:
                if 'id' in slot and 'name' in slot:
                    cursor.execute(
                        'UPDATE time_slots SET name = ? WHERE id = ?',
                        (slot['name'], slot['id'])
                    )

        # Update zone names if provided
        if 'zones' in data:
            for zone in data['zones']:
                if 'id' in zone and 'name' in zone:
                    cursor.execute(
                        'UPDATE zones SET name = ? WHERE id = ?',
                        (zone['name'], zone['id'])
                    )

        conn.commit()

    # Return updated config
    return get_config()
