from flask import Blueprint, jsonify, request
from database import get_db_context
from services.email_service import send_alert_email
from services.statistics_service import get_period_statistics
from datetime import datetime, timedelta
import pytz
import os

email_alerts_bp = Blueprint('email_alerts', __name__)

def get_db_path():
    return os.getenv('DATABASE_PATH', 'soundmeter.db')

@email_alerts_bp.route('/api/email-alert', methods=['POST'])
def send_email_alert():
    """Send email alert when threshold is exceeded"""
    data = request.get_json()

    if not data:
        return jsonify({"error": "No data provided"}), 400

    # Validate required fields
    required_fields = ['alert_type', 'current_db', 'timestamp', 'time_slot_id']
    for field in required_fields:
        if field not in data:
            return jsonify({"error": f"Missing required field: {field}"}), 400

    with get_db_context(get_db_path()) as conn:
        cursor = conn.cursor()

        # Check if email alerts are enabled
        cursor.execute("SELECT value FROM config WHERE key = 'email_enabled'")
        row = cursor.fetchone()
        if not row or row['value'].lower() != 'true':
            return jsonify({
                "success": False,
                "message": "Email alerts are disabled"
            }), 200

        # Get email configuration
        cursor.execute("SELECT key, value FROM config WHERE key IN (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ('email_recipient', 'smtp_host', 'smtp_port', 'instant_threshold_db',
             'average_threshold_db', 'average_time_window_minutes', 'cooldown_minutes',
             'last_instant_alert_sent', 'last_average_alert_sent'))

        config = {}
        for row in cursor.fetchall():
            config[row['key']] = row['value']

        # Check cooldown
        alert_type = data['alert_type']
        cooldown_key = f'last_{alert_type}_alert_sent'
        last_alert_str = config.get(cooldown_key, '')
        cooldown_minutes = int(config.get('cooldown_minutes', 5))

        tz = pytz.timezone(os.getenv('TIMEZONE', 'Europe/Paris'))
        now = datetime.now(tz)

        if last_alert_str:
            last_alert = datetime.fromisoformat(last_alert_str)
            time_since_last = (now - last_alert).total_seconds()
            cooldown_seconds = cooldown_minutes * 60

            if time_since_last < cooldown_seconds:
                seconds_remaining = int(cooldown_seconds - time_since_last)
                next_available = last_alert + timedelta(seconds=cooldown_seconds)

                return jsonify({
                    "success": False,
                    "message": "Alert in cooldown period",
                    "next_alert_available_at": next_available.isoformat(),
                    "seconds_remaining": seconds_remaining
                }), 429

        # Get time slot name
        cursor.execute("SELECT name FROM time_slots WHERE id = ?", (data['time_slot_id'],))
        slot_row = cursor.fetchone()
        slot_name = slot_row['name'] if slot_row else f"Time Slot {data['time_slot_id']}"

        # Parse timestamp
        timestamp = datetime.fromisoformat(data['timestamp'])
        if timestamp.tzinfo is None:
            timestamp = tz.localize(timestamp)

        # Get statistics for the period
        statistics = get_period_statistics(
            time_slot_id=data['time_slot_id'],
            current_time=timestamp,
            db_path=get_db_path()
        )

        # Prepare alert data
        alert_data = {
            'alert_type': alert_type,
            'current_db': data['current_db'],
            'average_db': data.get('average_db'),
            'timestamp': timestamp,
            'time_slot_id': data['time_slot_id'],
            'slot_name': slot_name,
            'instant_threshold': float(config.get('instant_threshold_db', 85.0)),
            'average_threshold': float(config.get('average_threshold_db', 75.0)),
            'average_window': int(config.get('average_time_window_minutes', 5))
        }

        # Send email
        success, message = send_alert_email(
            recipient=config.get('email_recipient', 'richardalbinana@asvalencia.org'),
            smtp_host=config.get('smtp_host', '172.17.50.100'),
            smtp_port=int(config.get('smtp_port', 25)),
            alert_data=alert_data,
            statistics=statistics
        )

        if not success:
            return jsonify({
                "success": False,
                "message": message
            }), 500

        # Update last alert timestamp
        cursor.execute(
            "UPDATE config SET value = ? WHERE key = ?",
            (now.isoformat(), cooldown_key)
        )
        conn.commit()

        next_available = now + timedelta(minutes=cooldown_minutes)

        return jsonify({
            "success": True,
            "message": "Alert email sent successfully",
            "next_alert_available_at": next_available.isoformat()
        }), 200

@email_alerts_bp.route('/api/email-alert/test', methods=['POST'])
def send_test_email():
    """Send a test email to verify SMTP configuration"""
    with get_db_context(get_db_path()) as conn:
        cursor = conn.cursor()

        # Get email configuration
        cursor.execute("SELECT key, value FROM config WHERE key IN (?, ?, ?, ?, ?, ?)",
            ('email_recipient', 'smtp_host', 'smtp_port', 'instant_threshold_db',
             'average_threshold_db', 'average_time_window_minutes'))

        config = {}
        for row in cursor.fetchall():
            config[row['key']] = row['value']

        # Create test alert data
        tz = pytz.timezone(os.getenv('TIMEZONE', 'Europe/Paris'))
        now = datetime.now(tz)

        alert_data = {
            'alert_type': 'instant',
            'current_db': 87.5,
            'average_db': None,
            'timestamp': now,
            'time_slot_id': 1,
            'slot_name': 'Test Period',
            'instant_threshold': float(config.get('instant_threshold_db', 85.0)),
            'average_threshold': float(config.get('average_threshold_db', 75.0)),
            'average_window': int(config.get('average_time_window_minutes', 5))
        }

        # Create test statistics
        statistics = {
            'peak_db': 89.2,
            'peak_timestamp': '12:08:30',
            'average_db': 72.3,
            'green_percent': 45.0,
            'yellow_percent': 38.0,
            'red_percent': 17.0,
            'recent_readings': [
                {'timestamp': '12:15:45', 'db': 87.5, 'zone': 'red'},
                {'timestamp': '12:15:44', 'db': 86.8, 'zone': 'red'},
                {'timestamp': '12:15:43', 'db': 85.2, 'zone': 'red'}
            ]
        }

        # Send test email
        success, message = send_alert_email(
            recipient=config.get('email_recipient', 'richardalbinana@asvalencia.org'),
            smtp_host=config.get('smtp_host', '172.17.50.100'),
            smtp_port=int(config.get('smtp_port', 25)),
            alert_data=alert_data,
            statistics=statistics
        )

        if not success:
            return jsonify({
                "success": False,
                "message": message
            }), 500

        return jsonify({
            "success": True,
            "message": f"Test email sent to {config.get('email_recipient')}"
        }), 200
