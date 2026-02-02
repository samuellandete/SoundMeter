# Email Alert System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add configurable email notifications when sound thresholds are exceeded (instant or rolling average).

**Architecture:** Frontend tracks rolling buffer and checks thresholds locally, calls backend API when triggered. Backend validates, enforces cooldown, fetches statistics, and sends email via SMTP.

**Tech Stack:** Python (smtplib), Flask, SQLite, React, JavaScript

---

## Task 1: Database Schema - Add Email Configuration

**Files:**
- Modify: `backend/database.py:104-114`
- Test: `backend/tests/test_database.py`

**Step 1: Write the failing test**

Create test for email config initialization:

```python
# backend/tests/test_database.py
def test_email_config_defaults():
    """Test that email configuration is initialized with defaults"""
    import os
    import tempfile
    from database import init_db, get_db_context

    # Create temporary database
    fd, db_path = tempfile.mkstemp()
    os.close(fd)

    try:
        init_db(db_path)

        with get_db_context(db_path) as conn:
            cursor = conn.cursor()

            # Check email_enabled exists
            cursor.execute("SELECT value FROM config WHERE key = 'email_enabled'")
            result = cursor.fetchone()
            assert result is not None
            assert result['value'] == 'false'

            # Check email_recipient exists
            cursor.execute("SELECT value FROM config WHERE key = 'email_recipient'")
            result = cursor.fetchone()
            assert result is not None
            assert result['value'] == 'richardalbinana@asvalencia.org'

            # Check smtp_host exists
            cursor.execute("SELECT value FROM config WHERE key = 'smtp_host'")
            result = cursor.fetchone()
            assert result is not None
            assert result['value'] == '172.17.50.100'

            # Check smtp_port exists
            cursor.execute("SELECT value FROM config WHERE key = 'smtp_port'")
            result = cursor.fetchone()
            assert result is not None
            assert result['value'] == '25'

            # Check instant_threshold_db exists
            cursor.execute("SELECT value FROM config WHERE key = 'instant_threshold_db'")
            result = cursor.fetchone()
            assert result is not None
            assert float(result['value']) == 85.0

            # Check average_threshold_db exists
            cursor.execute("SELECT value FROM config WHERE key = 'average_threshold_db'")
            result = cursor.fetchone()
            assert result is not None
            assert float(result['value']) == 75.0

            # Check average_time_window_minutes exists
            cursor.execute("SELECT value FROM config WHERE key = 'average_time_window_minutes'")
            result = cursor.fetchone()
            assert result is not None
            assert int(result['value']) == 5

            # Check cooldown_minutes exists
            cursor.execute("SELECT value FROM config WHERE key = 'cooldown_minutes'")
            result = cursor.fetchone()
            assert result is not None
            assert int(result['value']) == 5

    finally:
        os.unlink(db_path)
```

**Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_database.py::test_email_config_defaults -v`

Expected: FAIL with assertion errors (keys don't exist)

**Step 3: Implement email config defaults**

Modify `backend/database.py` around line 104:

```python
    # Insert default config
    cursor.execute('SELECT COUNT(*) FROM config')
    if cursor.fetchone()[0] == 0:
        default_config = {
            'thresholds': json.dumps({'orange_threshold': 60, 'red_threshold': 80}),
            'visual_update_rate': '1000',
            'calibration_offset': '0',  # dB offset for microphone calibration
            # Email alert settings
            'email_enabled': 'false',
            'email_recipient': 'richardalbinana@asvalencia.org',
            'smtp_host': '172.17.50.100',
            'smtp_port': '25',
            'instant_threshold_db': '85.0',
            'average_threshold_db': '75.0',
            'average_time_window_minutes': '5',
            'cooldown_minutes': '5',
            'last_instant_alert_sent': '',
            'last_average_alert_sent': ''
        }
        for key, value in default_config.items():
            cursor.execute('INSERT INTO config (key, value) VALUES (?, ?)', (key, value))
```

**Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_database.py::test_email_config_defaults -v`

Expected: PASS

**Step 5: Add migration for existing databases**

Add after line 118 in `backend/database.py`:

```python
    # Ensure email config exists (for existing databases)
    email_config_defaults = {
        'email_enabled': 'false',
        'email_recipient': 'richardalbinana@asvalencia.org',
        'smtp_host': '172.17.50.100',
        'smtp_port': '25',
        'instant_threshold_db': '85.0',
        'average_threshold_db': '75.0',
        'average_time_window_minutes': '5',
        'cooldown_minutes': '5',
        'last_instant_alert_sent': '',
        'last_average_alert_sent': ''
    }

    for key, default_value in email_config_defaults.items():
        cursor.execute('SELECT COUNT(*) FROM config WHERE key = ?', (key,))
        if cursor.fetchone()[0] == 0:
            cursor.execute('INSERT INTO config (key, value) VALUES (?, ?)', (key, default_value))
```

**Step 6: Test migration on existing database**

Run: `cd backend && python -c "from database import init_db; init_db('soundmeter.db')"`

Then run: `cd backend && python -m pytest tests/test_database.py::test_email_config_defaults -v`

Expected: PASS (migration adds missing keys)

**Step 7: Commit**

```bash
git add backend/database.py backend/tests/test_database.py
git commit -m "feat(db): add email alert configuration schema

Add email alert config defaults and migration for existing databases.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Backend Service - Email Sending Logic

**Files:**
- Create: `backend/services/__init__.py`
- Create: `backend/services/email_service.py`
- Create: `backend/templates/alert_email.html`
- Test: `backend/tests/test_email_service.py`

**Step 1: Create services directory and init file**

```bash
mkdir -p backend/services
touch backend/services/__init__.py
mkdir -p backend/templates
```

**Step 2: Write the failing test**

Create `backend/tests/test_email_service.py`:

```python
import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime
import pytz

@pytest.fixture
def alert_data():
    tz = pytz.timezone('Europe/Paris')
    return {
        'alert_type': 'instant',
        'current_db': 87.5,
        'average_db': None,
        'timestamp': datetime(2026, 2, 2, 12, 15, 45, tzinfo=tz),
        'time_slot_id': 1,
        'slot_name': 'Period 1',
        'instant_threshold': 85.0,
        'average_threshold': 75.0,
        'average_window': 5
    }

@pytest.fixture
def statistics():
    return {
        'peak_db': 89.2,
        'peak_timestamp': '12:08:30',
        'average_db': 72.3,
        'green_percent': 45.0,
        'yellow_percent': 38.0,
        'red_percent': 17.0,
        'recent_readings': [
            {'timestamp': '12:15:45', 'db': 87.5, 'zone': 'red'},
            {'timestamp': '12:15:44', 'db': 86.8, 'zone': 'red'},
            {'timestamp': '12:15:43', 'db': 85.2, 'zone': 'red'},
            {'timestamp': '12:15:42', 'db': 83.9, 'zone': 'yellow'},
            {'timestamp': '12:15:41', 'db': 82.1, 'zone': 'yellow'}
        ]
    }

def test_send_alert_email_success(alert_data, statistics):
    """Test successful email sending"""
    from services.email_service import send_alert_email

    with patch('smtplib.SMTP') as mock_smtp:
        # Mock SMTP server
        mock_server = MagicMock()
        mock_smtp.return_value.__enter__.return_value = mock_server

        success, message = send_alert_email(
            recipient='test@example.com',
            smtp_host='172.17.50.100',
            smtp_port=25,
            alert_data=alert_data,
            statistics=statistics
        )

        assert success is True
        assert message == "Email sent successfully"
        mock_smtp.assert_called_once_with('172.17.50.100', 25, timeout=10)
        mock_server.send_message.assert_called_once()

def test_send_alert_email_smtp_failure(alert_data, statistics):
    """Test email sending when SMTP fails"""
    from services.email_service import send_alert_email
    import smtplib

    with patch('smtplib.SMTP') as mock_smtp:
        mock_smtp.side_effect = smtplib.SMTPException("Connection refused")

        success, message = send_alert_email(
            recipient='test@example.com',
            smtp_host='172.17.50.100',
            smtp_port=25,
            alert_data=alert_data,
            statistics=statistics
        )

        assert success is False
        assert "SMTP error" in message

def test_format_subject_instant(alert_data):
    """Test subject line formatting for instant alert"""
    from services.email_service import format_subject

    subject = format_subject(alert_data)

    assert "[Sound Alert]" in subject
    assert "Instant" in subject
    assert "Period 1" in subject
    assert "2026-02-02" in subject

def test_format_subject_average(alert_data):
    """Test subject line formatting for average alert"""
    from services.email_service import format_subject

    alert_data['alert_type'] = 'average'
    alert_data['average_db'] = 78.5

    subject = format_subject(alert_data)

    assert "[Sound Alert]" in subject
    assert "Average" in subject
```

**Step 3: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_email_service.py -v`

Expected: FAIL (module not found)

**Step 4: Implement email service**

Create `backend/services/email_service.py`:

```python
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
import os

def send_alert_email(
    recipient: str,
    smtp_host: str,
    smtp_port: int,
    alert_data: dict,
    statistics: dict
) -> tuple:
    """
    Send alert email via SMTP

    Args:
        recipient: Email address to send to
        smtp_host: SMTP server hostname
        smtp_port: SMTP server port
        alert_data: Dict with alert details (alert_type, current_db, timestamp, etc.)
        statistics: Dict with period statistics

    Returns:
        Tuple of (success: bool, message: str)
    """
    try:
        # Construct email
        msg = MIMEMultipart('alternative')
        msg['Subject'] = format_subject(alert_data)
        msg['From'] = 'soundmeter@asvalencia.org'
        msg['To'] = recipient

        # Plain text version
        text_body = render_text_email(alert_data, statistics)
        msg.attach(MIMEText(text_body, 'plain', 'utf-8'))

        # HTML version
        html_body = render_html_email(alert_data, statistics)
        msg.attach(MIMEText(html_body, 'html', 'utf-8'))

        # Send via SMTP
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.send_message(msg)

        return True, "Email sent successfully"

    except smtplib.SMTPException as e:
        return False, f"SMTP error: {str(e)}"
    except Exception as e:
        return False, f"Failed to send email: {str(e)}"

def format_subject(alert_data: dict) -> str:
    """Format email subject line"""
    alert_type = alert_data['alert_type'].capitalize()
    slot_name = alert_data['slot_name']
    timestamp = alert_data['timestamp'].strftime('%Y-%m-%d %H:%M:%S')

    return f"[Sound Alert] {alert_type} threshold exceeded - {slot_name} ({timestamp})"

def render_text_email(alert_data: dict, statistics: dict) -> str:
    """Render plain text email body"""
    alert_type = alert_data['alert_type'].capitalize()
    current_db = alert_data['current_db']
    timestamp = alert_data['timestamp'].strftime('%Y-%m-%d %H:%M:%S %Z')
    slot_name = alert_data['slot_name']

    if alert_data['alert_type'] == 'instant':
        threshold = alert_data['instant_threshold']
        threshold_info = f"Threshold: {threshold} dB"
    else:
        threshold = alert_data['average_threshold']
        window = alert_data['average_window']
        threshold_info = f"Threshold: {threshold} dB (over {window} minutes)"

    exceeded_by = current_db - threshold

    text = f"""SOUND LEVEL ALERT

Alert Type: {alert_type} threshold exceeded
Time: {timestamp}
Time Slot: {slot_name}

CURRENT READINGS
- Current Level: {current_db} dB
- {threshold_info}
- Exceeded by: {exceeded_by:.1f} dB
"""

    if statistics:
        text += f"""
PERIOD STATISTICS (so far)
- Peak: {statistics['peak_db']} dB at {statistics['peak_timestamp']}
- Average: {statistics['average_db']} dB
- Time in Green Zone: {statistics['green_percent']}%
- Time in Yellow Zone: {statistics['yellow_percent']}%
- Time in Red Zone: {statistics['red_percent']}%

RECENT HISTORY (last 5 readings)
"""
        for reading in statistics['recent_readings']:
            zone_label = reading['zone'].upper()
            text += f"{reading['timestamp']} - {reading['db']} dB [{zone_label}]\n"

    text += """
---
Generated by ASV Sound Meter System
"""

    return text

def render_html_email(alert_data: dict, statistics: dict) -> str:
    """Render HTML email body"""
    alert_type = alert_data['alert_type'].capitalize()
    current_db = alert_data['current_db']
    timestamp = alert_data['timestamp'].strftime('%Y-%m-%d %H:%M:%S %Z')
    slot_name = alert_data['slot_name']

    if alert_data['alert_type'] == 'instant':
        threshold = alert_data['instant_threshold']
        threshold_info = f"Threshold: {threshold} dB"
    else:
        threshold = alert_data['average_threshold']
        window = alert_data['average_window']
        threshold_info = f"Threshold: {threshold} dB (over {window} minutes)"

    exceeded_by = current_db - threshold

    html = f"""<!DOCTYPE html>
<html>
<head>
  <style>
    body {{ font-family: Arial, sans-serif; color: #333; line-height: 1.6; }}
    h2 {{ color: #d32f2f; }}
    h3 {{ color: #555; margin-top: 20px; }}
    table {{ border-collapse: collapse; margin-top: 10px; width: 100%; max-width: 400px; }}
    td {{ padding: 8px; border: 1px solid #ddd; }}
    .green {{ color: #4caf50; font-weight: bold; }}
    .yellow {{ color: #ff9800; font-weight: bold; }}
    .red {{ color: #d32f2f; font-weight: bold; }}
    ul {{ list-style-type: none; padding-left: 0; }}
    li {{ margin: 8px 0; }}
  </style>
</head>
<body>
  <h2>🔔 Sound Level Alert</h2>

  <p><strong>Alert Type:</strong> {alert_type} threshold exceeded</p>
  <p><strong>Time:</strong> {timestamp}</p>
  <p><strong>Time Slot:</strong> {slot_name}</p>

  <h3>Current Readings</h3>
  <ul>
    <li><strong>Current Level:</strong> {current_db} dB</li>
    <li><strong>{threshold_info}</strong></li>
    <li><strong>Exceeded by:</strong> {exceeded_by:.1f} dB</li>
  </ul>
"""

    if statistics:
        html += f"""
  <h3>Period Statistics (so far)</h3>
  <ul>
    <li><strong>Peak:</strong> {statistics['peak_db']} dB at {statistics['peak_timestamp']}</li>
    <li><strong>Average:</strong> {statistics['average_db']} dB</li>
    <li><strong>Time in Green Zone:</strong> {statistics['green_percent']}%</li>
    <li><strong>Time in Yellow Zone:</strong> {statistics['yellow_percent']}%</li>
    <li><strong>Time in Red Zone:</strong> {statistics['red_percent']}%</li>
  </ul>

  <h3>Recent History (last 5 readings)</h3>
  <table>
"""
        for reading in statistics['recent_readings']:
            zone_class = reading['zone']
            html += f"""    <tr>
      <td>{reading['timestamp']}</td>
      <td class="{zone_class}">{reading['db']} dB</td>
    </tr>
"""
        html += """  </table>
"""

    html += """
  <hr style="margin-top: 30px;">
  <p style="color: #777; font-size: 0.9em;">
    <em>Generated by ASV Sound Meter System</em>
  </p>
</body>
</html>"""

    return html
```

**Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_email_service.py -v`

Expected: PASS (all tests)

**Step 6: Commit**

```bash
git add backend/services/ backend/tests/test_email_service.py
git commit -m "feat(email): add email service with HTML and plain text templates

Implement SMTP email sending with formatted alerts.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Backend Service - Statistics Calculation

**Files:**
- Create: `backend/services/statistics_service.py`
- Test: `backend/tests/test_statistics_service.py`

**Step 1: Write the failing test**

Create `backend/tests/test_statistics_service.py`:

```python
import pytest
import os
import tempfile
from datetime import datetime, timedelta
import pytz
from database import init_db, get_db_context

@pytest.fixture
def test_db():
    """Create temporary test database with sample data"""
    fd, db_path = tempfile.mkstemp()
    os.close(fd)

    init_db(db_path)

    # Insert test data
    tz = pytz.timezone('Europe/Paris')
    base_time = datetime(2026, 2, 2, 11, 30, 0, tzinfo=tz)

    with get_db_context(db_path) as conn:
        cursor = conn.cursor()

        # Insert test logs for time slot 1 (11:30-12:00)
        test_logs = [
            (base_time + timedelta(seconds=0), 55.0, 1),   # green
            (base_time + timedelta(seconds=30), 65.0, 1),  # yellow
            (base_time + timedelta(seconds=60), 85.0, 1),  # red
            (base_time + timedelta(seconds=90), 90.0, 1),  # red (peak)
            (base_time + timedelta(seconds=120), 70.0, 1), # yellow
        ]

        for timestamp, decibels, time_slot_id in test_logs:
            cursor.execute(
                'INSERT INTO sound_logs (timestamp, decibels, time_slot_id) VALUES (?, ?, ?)',
                (timestamp, decibels, time_slot_id)
            )

        conn.commit()

    yield db_path

    os.unlink(db_path)

def test_get_period_statistics(test_db):
    """Test calculation of period statistics"""
    from services.statistics_service import get_period_statistics
    import pytz

    tz = pytz.timezone('Europe/Paris')
    current_time = datetime(2026, 2, 2, 11, 32, 30, tzinfo=tz)

    stats = get_period_statistics(
        time_slot_id=1,
        current_time=current_time,
        db_path=test_db
    )

    assert stats is not None
    assert stats['peak_db'] == 90.0
    assert stats['average_db'] == 73.0  # (55+65+85+90+70)/5
    assert stats['green_percent'] == 20.0  # 1 out of 5
    assert stats['yellow_percent'] == 40.0  # 2 out of 5
    assert stats['red_percent'] == 40.0    # 2 out of 5
    assert len(stats['recent_readings']) == 5

def test_get_period_statistics_no_data(test_db):
    """Test statistics when no data exists for period"""
    from services.statistics_service import get_period_statistics
    import pytz

    tz = pytz.timezone('Europe/Paris')
    current_time = datetime(2026, 2, 2, 12, 15, 0, tzinfo=tz)

    stats = get_period_statistics(
        time_slot_id=2,  # No data for slot 2
        current_time=current_time,
        db_path=test_db
    )

    assert stats is None

def test_get_recent_readings(test_db):
    """Test fetching recent readings"""
    from services.statistics_service import get_recent_readings
    import pytz

    tz = pytz.timezone('Europe/Paris')
    current_time = datetime(2026, 2, 2, 11, 32, 30, tzinfo=tz)

    readings = get_recent_readings(
        time_slot_id=1,
        current_time=current_time,
        limit=5,
        db_path=test_db
    )

    assert len(readings) == 5
    # Most recent first
    assert readings[0]['db'] == 70.0
    assert readings[-1]['db'] == 55.0
    assert 'zone' in readings[0]
```

**Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_statistics_service.py -v`

Expected: FAIL (module not found)

**Step 3: Implement statistics service**

Create `backend/services/statistics_service.py`:

```python
from database import get_db_context
from datetime import datetime
import os
import json

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
            green_max = thresholds.get('orange_threshold', 60)  # green is below orange
            yellow_max = thresholds.get('red_threshold', 80)     # yellow is between orange and red
        else:
            green_max = 60
            yellow_max = 80

        # Get logs for current slot today
        today = current_time.date()
        cursor.execute('''
            SELECT decibels, timestamp
            FROM sound_logs
            WHERE time_slot_id = ?
              AND DATE(timestamp) = ?
            ORDER BY timestamp
        ''', (time_slot_id, today))

        logs = cursor.fetchall()

        if not logs:
            return None

        # Calculate statistics
        decibels = [log['decibels'] for log in logs]
        peak_db = max(decibels)
        peak_log = next(log for log in logs if log['decibels'] == peak_db)
        average_db = sum(decibels) / len(decibels)

        # Format peak timestamp
        if isinstance(peak_log['timestamp'], str):
            peak_time = datetime.fromisoformat(peak_log['timestamp'])
        else:
            peak_time = peak_log['timestamp']
        peak_timestamp = peak_time.strftime('%H:%M:%S')

        # Zone percentages
        green_count = sum(1 for db in decibels if db <= green_max)
        yellow_count = sum(1 for db in decibels if green_max < db <= yellow_max)
        red_count = sum(1 for db in decibels if db > yellow_max)
        total = len(decibels)

        # Get recent readings
        recent_readings = get_recent_readings(time_slot_id, current_time, limit=5, db_path=db_path)

        return {
            'peak_db': round(peak_db, 1),
            'peak_timestamp': peak_timestamp,
            'average_db': round(average_db, 1),
            'green_percent': round((green_count / total) * 100, 1),
            'yellow_percent': round((yellow_count / total) * 100, 1),
            'red_percent': round((red_count / total) * 100, 1),
            'recent_readings': recent_readings
        }

def get_recent_readings(time_slot_id: int, current_time: datetime, limit: int = 5, db_path: str = None) -> list:
    """
    Get recent readings for a time slot

    Returns:
        List of dicts with timestamp, db, and zone
    """
    if db_path is None:
        db_path = os.getenv('DATABASE_PATH', 'soundmeter.db')

    with get_db_context(db_path) as conn:
        cursor = conn.cursor()

        # Get thresholds
        cursor.execute("SELECT value FROM config WHERE key = 'thresholds'")
        thresholds_row = cursor.fetchone()
        if thresholds_row:
            thresholds = json.loads(thresholds_row['value'])
            green_max = thresholds.get('orange_threshold', 60)
            yellow_max = thresholds.get('red_threshold', 80)
        else:
            green_max = 60
            yellow_max = 80

        today = current_time.date()
        cursor.execute('''
            SELECT decibels, timestamp
            FROM sound_logs
            WHERE time_slot_id = ?
              AND DATE(timestamp) = ?
            ORDER BY timestamp DESC
            LIMIT ?
        ''', (time_slot_id, today, limit))

        logs = cursor.fetchall()

        readings = []
        for log in logs:
            db = log['decibels']

            # Determine zone
            if db <= green_max:
                zone = 'green'
            elif db <= yellow_max:
                zone = 'yellow'
            else:
                zone = 'red'

            # Format timestamp
            if isinstance(log['timestamp'], str):
                timestamp = datetime.fromisoformat(log['timestamp'])
            else:
                timestamp = log['timestamp']

            readings.append({
                'timestamp': timestamp.strftime('%H:%M:%S'),
                'db': round(db, 1),
                'zone': zone
            })

        return readings
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_statistics_service.py -v`

Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add backend/services/statistics_service.py backend/tests/test_statistics_service.py
git commit -m "feat(stats): add period statistics calculation service

Calculate peak, average, zone percentages, and recent readings.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Backend API - Email Alert Endpoint

**Files:**
- Create: `backend/routes/email_alerts.py`
- Modify: `backend/app.py:16-17`
- Test: `backend/tests/test_email_alerts_api.py`

**Step 1: Write the failing test**

Create `backend/tests/test_email_alerts_api.py`:

```python
import pytest
import json
import os
import tempfile
from datetime import datetime, timedelta
import pytz
from app import app
from database import init_db, get_db_context

@pytest.fixture
def client():
    """Create test client"""
    app.config['TESTING'] = True

    # Create temporary database
    fd, db_path = tempfile.mkstemp()
    os.close(fd)
    os.environ['DATABASE_PATH'] = db_path

    init_db(db_path)

    # Enable email alerts in config
    with get_db_context(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE config SET value = 'true' WHERE key = 'email_enabled'")
        conn.commit()

    with app.test_client() as client:
        yield client

    os.unlink(db_path)

def test_email_alert_endpoint_disabled(client):
    """Test alert endpoint when email is disabled"""
    db_path = os.environ['DATABASE_PATH']

    # Disable email
    with get_db_context(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE config SET value = 'false' WHERE key = 'email_enabled'")
        conn.commit()

    tz = pytz.timezone('Europe/Paris')
    timestamp = datetime(2026, 2, 2, 11, 45, 0, tzinfo=tz).isoformat()

    response = client.post('/api/email-alert', json={
        'alert_type': 'instant',
        'current_db': 87.5,
        'timestamp': timestamp,
        'time_slot_id': 1
    })

    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['success'] is False
    assert 'disabled' in data['message'].lower()

def test_email_alert_instant_threshold(client):
    """Test instant threshold alert"""
    from unittest.mock import patch

    tz = pytz.timezone('Europe/Paris')
    timestamp = datetime(2026, 2, 2, 11, 45, 0, tzinfo=tz).isoformat()

    with patch('services.email_service.send_alert_email') as mock_send:
        mock_send.return_value = (True, "Email sent successfully")

        response = client.post('/api/email-alert', json={
            'alert_type': 'instant',
            'current_db': 87.5,
            'timestamp': timestamp,
            'time_slot_id': 1
        })

        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
        assert 'next_alert_available_at' in data
        mock_send.assert_called_once()

def test_email_alert_cooldown_enforcement(client):
    """Test that cooldown prevents duplicate alerts"""
    from unittest.mock import patch

    tz = pytz.timezone('Europe/Paris')
    timestamp = datetime(2026, 2, 2, 11, 45, 0, tzinfo=tz).isoformat()

    with patch('services.email_service.send_alert_email') as mock_send:
        mock_send.return_value = (True, "Email sent successfully")

        # First alert - should succeed
        response1 = client.post('/api/email-alert', json={
            'alert_type': 'instant',
            'current_db': 87.5,
            'timestamp': timestamp,
            'time_slot_id': 1
        })

        assert response1.status_code == 200
        data1 = json.loads(response1.data)
        assert data1['success'] is True

        # Second alert immediately after - should be in cooldown
        response2 = client.post('/api/email-alert', json={
            'alert_type': 'instant',
            'current_db': 90.0,
            'timestamp': timestamp,
            'time_slot_id': 1
        })

        assert response2.status_code == 429
        data2 = json.loads(response2.data)
        assert data2['success'] is False
        assert 'cooldown' in data2['message'].lower()
        assert 'seconds_remaining' in data2

def test_email_alert_average_threshold(client):
    """Test average threshold alert"""
    from unittest.mock import patch

    tz = pytz.timezone('Europe/Paris')
    timestamp = datetime(2026, 2, 2, 11, 45, 0, tzinfo=tz).isoformat()

    with patch('services.email_service.send_alert_email') as mock_send:
        mock_send.return_value = (True, "Email sent successfully")

        response = client.post('/api/email-alert', json={
            'alert_type': 'average',
            'current_db': 78.0,
            'average_db': 76.5,
            'timestamp': timestamp,
            'time_slot_id': 1
        })

        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True

def test_email_alert_test_endpoint(client):
    """Test the test email endpoint"""
    from unittest.mock import patch

    with patch('services.email_service.send_alert_email') as mock_send:
        mock_send.return_value = (True, "Email sent successfully")

        response = client.post('/api/email-alert/test')

        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
        mock_send.assert_called_once()
```

**Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_email_alerts_api.py -v`

Expected: FAIL (routes not registered)

**Step 3: Implement email alerts route**

Create `backend/routes/email_alerts.py`:

```python
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
```

**Step 4: Register blueprint in app.py**

Modify `backend/app.py` after line 17:

```python
from routes.export import export_bp
app.register_blueprint(export_bp)
from routes.email_alerts import email_alerts_bp
app.register_blueprint(email_alerts_bp)
```

**Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_email_alerts_api.py -v`

Expected: PASS (all tests)

**Step 6: Commit**

```bash
git add backend/routes/email_alerts.py backend/app.py backend/tests/test_email_alerts_api.py
git commit -m "feat(api): add email alert endpoints with cooldown enforcement

Implement /api/email-alert and /api/email-alert/test endpoints.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Backend API - Extend Config Endpoint

**Files:**
- Modify: `backend/routes/config.py:18-57`
- Modify: `backend/routes/config.py:60-118`
- Test: `backend/tests/test_config_api.py`

**Step 1: Write the failing test**

Add to `backend/tests/test_config_api.py`:

```python
def test_get_config_includes_email_alerts():
    """Test that GET /api/config includes email_alerts section"""
    import json
    import os
    import tempfile
    from app import app
    from database import init_db

    app.config['TESTING'] = True

    fd, db_path = tempfile.mkstemp()
    os.close(fd)
    os.environ['DATABASE_PATH'] = db_path

    init_db(db_path)

    with app.test_client() as client:
        response = client.get('/api/config')

        assert response.status_code == 200
        data = json.loads(response.data)

        assert 'email_alerts' in data
        assert 'enabled' in data['email_alerts']
        assert 'recipient' in data['email_alerts']
        assert 'smtp_host' in data['email_alerts']
        assert 'smtp_port' in data['email_alerts']
        assert 'instant_threshold_db' in data['email_alerts']
        assert 'average_threshold_db' in data['email_alerts']
        assert 'average_time_window_minutes' in data['email_alerts']
        assert 'cooldown_minutes' in data['email_alerts']

        # Check default values
        assert data['email_alerts']['enabled'] is False
        assert data['email_alerts']['recipient'] == 'richardalbinana@asvalencia.org'
        assert data['email_alerts']['smtp_host'] == '172.17.50.100'
        assert data['email_alerts']['smtp_port'] == 25

    os.unlink(db_path)

def test_update_email_alerts_config():
    """Test that POST /api/config updates email_alerts settings"""
    import json
    import os
    import tempfile
    from app import app
    from database import init_db, get_db_context

    app.config['TESTING'] = True

    fd, db_path = tempfile.mkstemp()
    os.close(fd)
    os.environ['DATABASE_PATH'] = db_path

    init_db(db_path)

    with app.test_client() as client:
        # Update email alerts config
        response = client.post('/api/config', json={
            'email_alerts': {
                'enabled': True,
                'recipient': 'test@example.com',
                'instant_threshold_db': 90.0,
                'cooldown_minutes': 10
            }
        })

        assert response.status_code == 200
        data = json.loads(response.data)

        assert data['email_alerts']['enabled'] is True
        assert data['email_alerts']['recipient'] == 'test@example.com'
        assert data['email_alerts']['instant_threshold_db'] == 90.0
        assert data['email_alerts']['cooldown_minutes'] == 10

        # Verify in database
        with get_db_context(db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM config WHERE key = 'email_enabled'")
            assert cursor.fetchone()['value'] == 'true'

            cursor.execute("SELECT value FROM config WHERE key = 'email_recipient'")
            assert cursor.fetchone()['value'] == 'test@example.com'

    os.unlink(db_path)
```

**Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_config_api.py::test_get_config_includes_email_alerts -v`

Expected: FAIL (email_alerts not in response)

**Step 3: Modify GET /api/config to include email_alerts**

In `backend/routes/config.py`, replace the return statement (around line 58):

```python
        config_data['zones'] = zones

        # Get email alerts configuration
        cursor.execute('''SELECT key, value FROM config
                         WHERE key IN ('email_enabled', 'email_recipient', 'smtp_host', 'smtp_port',
                                       'instant_threshold_db', 'average_threshold_db',
                                       'average_time_window_minutes', 'cooldown_minutes')''')

        email_config = {}
        for row in cursor.fetchall():
            if row['key'] == 'email_enabled':
                email_config['enabled'] = row['value'].lower() == 'true'
            elif row['key'] == 'email_recipient':
                email_config['recipient'] = row['value']
            elif row['key'] == 'smtp_host':
                email_config['smtp_host'] = row['value']
            elif row['key'] == 'smtp_port':
                email_config['smtp_port'] = int(row['value'])
            elif row['key'] == 'instant_threshold_db':
                email_config['instant_threshold_db'] = float(row['value'])
            elif row['key'] == 'average_threshold_db':
                email_config['average_threshold_db'] = float(row['value'])
            elif row['key'] == 'average_time_window_minutes':
                email_config['average_time_window_minutes'] = int(row['value'])
            elif row['key'] == 'cooldown_minutes':
                email_config['cooldown_minutes'] = int(row['value'])

        config_data['email_alerts'] = email_config

    return jsonify(config_data), 200
```

**Step 4: Modify POST /api/config to update email_alerts**

In `backend/routes/config.py`, add before the conn.commit() (around line 114):

```python
        # Update zone names if provided
        if 'zones' in data:
            for zone in data['zones']:
                if 'id' in zone and 'name' in zone:
                    cursor.execute(
                        'UPDATE zones SET name = ? WHERE id = ?',
                        (zone['name'], zone['id'])
                    )

        # Update email alerts configuration if provided
        if 'email_alerts' in data:
            email_data = data['email_alerts']

            if 'enabled' in email_data:
                value = 'true' if email_data['enabled'] else 'false'
                cursor.execute(
                    'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
                    ('email_enabled', value)
                )

            if 'recipient' in email_data:
                cursor.execute(
                    'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
                    ('email_recipient', email_data['recipient'])
                )

            if 'smtp_host' in email_data:
                cursor.execute(
                    'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
                    ('smtp_host', email_data['smtp_host'])
                )

            if 'smtp_port' in email_data:
                cursor.execute(
                    'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
                    ('smtp_port', str(email_data['smtp_port']))
                )

            if 'instant_threshold_db' in email_data:
                cursor.execute(
                    'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
                    ('instant_threshold_db', str(email_data['instant_threshold_db']))
                )

            if 'average_threshold_db' in email_data:
                cursor.execute(
                    'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
                    ('average_threshold_db', str(email_data['average_threshold_db']))
                )

            if 'average_time_window_minutes' in email_data:
                cursor.execute(
                    'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
                    ('average_time_window_minutes', str(email_data['average_time_window_minutes']))
                )

            if 'cooldown_minutes' in email_data:
                cursor.execute(
                    'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
                    ('cooldown_minutes', str(email_data['cooldown_minutes']))
                )

        conn.commit()
```

**Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_config_api.py -v`

Expected: PASS (all tests including new ones)

**Step 6: Commit**

```bash
git add backend/routes/config.py backend/tests/test_config_api.py
git commit -m "feat(api): extend config endpoint with email_alerts section

Add email alert settings to GET/POST /api/config.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Frontend Utility - Time Slot Detection

**Files:**
- Create: `frontend/src/utils/timeSlotUtils.js`
- Test: Manual testing (no Jest setup yet)

**Step 1: Create time slot utility**

Create `frontend/src/utils/timeSlotUtils.js`:

```javascript
/**
 * Determine which time slot the given date falls into
 *
 * @param {Date} date - The date/time to check
 * @returns {number|null} - Time slot ID (1-4) or null if outside lunch period
 */
export const determineTimeSlot = (date) => {
  const hour = date.getHours();
  const minute = date.getMinutes();
  const timeInMinutes = hour * 60 + minute;

  // 11:30-12:00 = 690-720 minutes = slot 1
  if (timeInMinutes >= 690 && timeInMinutes < 720) return 1;

  // 12:00-12:30 = 720-750 minutes = slot 2
  if (timeInMinutes >= 720 && timeInMinutes < 750) return 2;

  // 12:30-13:00 = 750-780 minutes = slot 3
  if (timeInMinutes >= 750 && timeInMinutes < 780) return 3;

  // 13:00-13:30 = 780-810 minutes = slot 4
  if (timeInMinutes >= 780 && timeInMinutes < 810) return 4;

  return null; // Outside lunch period
};

/**
 * Check if date is within lunch hours (11:30-13:30)
 *
 * @param {Date} date - The date/time to check
 * @returns {boolean} - True if within lunch hours
 */
export const isWithinLunchHours = (date) => {
  return determineTimeSlot(date) !== null;
};

/**
 * Get time slot info by ID
 *
 * @param {number} slotId - Time slot ID (1-4)
 * @returns {object} - Object with start_time, end_time
 */
export const getTimeSlotInfo = (slotId) => {
  const slots = {
    1: { start_time: '11:30:00', end_time: '12:00:00' },
    2: { start_time: '12:00:00', end_time: '12:30:00' },
    3: { start_time: '12:30:00', end_time: '13:00:00' },
    4: { start_time: '13:00:00', end_time: '13:30:00' }
  };

  return slots[slotId] || null;
};
```

**Step 2: Manual test in browser console**

Start the frontend dev server:
```bash
cd frontend && npm start
```

Open browser console and test:
```javascript
import { determineTimeSlot } from './utils/timeSlotUtils';

// Test within lunch period
console.log(determineTimeSlot(new Date('2026-02-02T11:45:00'))); // Should be 1
console.log(determineTimeSlot(new Date('2026-02-02T12:15:00'))); // Should be 2
console.log(determineTimeSlot(new Date('2026-02-02T12:45:00'))); // Should be 3
console.log(determineTimeSlot(new Date('2026-02-02T13:15:00'))); // Should be 4

// Test outside lunch period
console.log(determineTimeSlot(new Date('2026-02-02T10:00:00'))); // Should be null
console.log(determineTimeSlot(new Date('2026-02-02T14:00:00'))); // Should be null
```

Expected: All outputs match expected values

**Step 3: Commit**

```bash
git add frontend/src/utils/timeSlotUtils.js
git commit -m "feat(utils): add time slot detection utility

Determine time slot from timestamp and check lunch hours.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Frontend Hook - Email Alerts Logic

**Files:**
- Create: `frontend/src/hooks/useEmailAlerts.js`

**Step 1: Create email alerts hook**

Create `frontend/src/hooks/useEmailAlerts.js`:

```javascript
import { useState, useEffect, useRef } from 'react';
import { determineTimeSlot } from '../utils/timeSlotUtils';

/**
 * Hook to manage email alert logic with rolling buffer and threshold checking
 *
 * @param {number} currentDb - Current decibel reading
 * @param {object} emailConfig - Email configuration from backend
 * @param {number} updateInterval - Visual update interval in ms
 * @returns {object} - Buffer state and alert status
 */
export const useEmailAlerts = (currentDb, emailConfig, updateInterval = 1000) => {
  const [buffer, setBuffer] = useState([]);
  const [lastInstantAlert, setLastInstantAlert] = useState(null);
  const [lastAverageAlert, setLastAverageAlert] = useState(null);
  const [currentTimeSlot, setCurrentTimeSlot] = useState(null);
  const [alertStatus, setAlertStatus] = useState('idle'); // idle, sending, success, error

  useEffect(() => {
    // Skip if email alerts disabled or no config
    if (!emailConfig || !emailConfig.enabled) {
      return;
    }

    // Skip if currentDb is 0 (not initialized)
    if (currentDb === 0) {
      return;
    }

    const now = new Date();
    const timeSlotId = determineTimeSlot(now);

    // Outside lunch hours - clear buffer and skip
    if (timeSlotId === null) {
      if (buffer.length > 0) {
        setBuffer([]);
      }
      setCurrentTimeSlot(null);
      return;
    }

    // Time slot changed - clear buffer and reset
    if (timeSlotId !== currentTimeSlot) {
      setBuffer([]);
      setCurrentTimeSlot(timeSlotId);
      return;
    }

    // Add current reading to buffer
    const newReading = {
      timestamp: now,
      db: currentDb,
      timeSlotId
    };

    // Remove readings older than average time window
    const windowMs = emailConfig.average_time_window_minutes * 60 * 1000;
    const updatedBuffer = [...buffer, newReading].filter(reading =>
      (now - reading.timestamp) <= windowMs
    );

    setBuffer(updatedBuffer);

    // Check instant threshold
    if (currentDb > emailConfig.instant_threshold_db) {
      const cooldownMs = emailConfig.cooldown_minutes * 60 * 1000;
      const canSend = !lastInstantAlert || (now - lastInstantAlert) > cooldownMs;

      if (canSend) {
        sendAlert('instant', currentDb, null, now, timeSlotId);
        setLastInstantAlert(now);
      }
    }

    // Check average threshold (only if buffer has enough data)
    const updateIntervalSeconds = updateInterval / 1000;
    const minReadings = Math.floor(
      (emailConfig.average_time_window_minutes * 60) / updateIntervalSeconds
    );

    if (updatedBuffer.length >= minReadings) {
      const sum = updatedBuffer.reduce((acc, reading) => acc + reading.db, 0);
      const average = sum / updatedBuffer.length;

      if (average > emailConfig.average_threshold_db) {
        const cooldownMs = emailConfig.cooldown_minutes * 60 * 1000;
        const canSend = !lastAverageAlert || (now - lastAverageAlert) > cooldownMs;

        if (canSend) {
          sendAlert('average', currentDb, average, now, timeSlotId);
          setLastAverageAlert(now);
        }
      }
    }
  }, [currentDb, emailConfig, buffer, currentTimeSlot, lastInstantAlert, lastAverageAlert, updateInterval]);

  const sendAlert = async (alertType, currentDb, averageDb, timestamp, timeSlotId) => {
    setAlertStatus('sending');

    try {
      const payload = {
        alert_type: alertType,
        current_db: currentDb,
        timestamp: timestamp.toISOString(),
        time_slot_id: timeSlotId
      };

      // Include average_db for average alerts
      if (alertType === 'average' && averageDb !== null) {
        payload.average_db = averageDb;
      }

      const response = await fetch('/api/email-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setAlertStatus('success');
        console.log(`Email alert sent: ${alertType} threshold at ${currentDb} dB`);
      } else {
        setAlertStatus('idle');
        console.warn('Email alert not sent:', data.message);
      }
    } catch (error) {
      setAlertStatus('error');
      console.error('Failed to send email alert:', error);
    }

    // Reset status after 3 seconds
    setTimeout(() => setAlertStatus('idle'), 3000);
  };

  return {
    buffer,
    alertStatus,
    bufferSize: buffer.length
  };
};
```

**Step 2: Commit**

```bash
git add frontend/src/hooks/useEmailAlerts.js
git commit -m "feat(hooks): add useEmailAlerts hook for threshold monitoring

Implement rolling buffer, threshold checking, and alert sending.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Frontend Integration - Connect Hook to Audio

**Files:**
- Modify: `frontend/src/hooks/useAudioLevel.js:1-63`
- Modify: `frontend/src/App.js` (to fetch and pass email config)

**Step 1: Fetch email config in App.js**

Modify `frontend/src/App.js` to fetch email configuration. Find where config is fetched (likely in a useEffect), and ensure email_alerts is included:

```javascript
// In App.js, find the fetchConfig function or useEffect that loads config
// Add email_alerts to state

const [emailConfig, setEmailConfig] = useState(null);

// In the fetch config logic:
const fetchConfig = async () => {
  try {
    const response = await fetch('/api/config');
    const data = await response.json();

    setThresholds(data.thresholds);
    setTimeSlots(data.time_slots);
    setZones(data.zones);
    setEmailConfig(data.email_alerts); // Add this line

    // ... rest of config handling
  } catch (error) {
    console.error('Failed to fetch config:', error);
  }
};
```

**Step 2: Pass emailConfig to components that use useAudioLevel**

Find where `useAudioLevel` hook is used (likely in SoundMeter component or App.js). Pass the emailConfig:

```javascript
// In the component that uses useAudioLevel:
const { decibels, isInitialized, error, initialize, stop } = useAudioLevel(
  visualUpdateRate,
  emailConfig  // Add this parameter
);
```

**Step 3: Modify useAudioLevel to integrate useEmailAlerts**

Modify `frontend/src/hooks/useAudioLevel.js`:

```javascript
import { useState, useEffect, useRef } from 'react';
import AudioProcessor from '../utils/audioProcessor';
import { useEmailAlerts } from './useEmailAlerts';

export const useAudioLevel = (updateInterval = 1000, emailConfig = null) => {
  const [decibels, setDecibels] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState(null);
  const audioProcessorRef = useRef(null);
  const intervalRef = useRef(null);

  // Integrate email alerts hook
  const { buffer, alertStatus, bufferSize } = useEmailAlerts(
    decibels,
    emailConfig,
    updateInterval
  );

  const initialize = async () => {
    const processor = new AudioProcessor();
    const result = await processor.initialize();

    if (result.success) {
      audioProcessorRef.current = processor;
      setIsInitialized(true);
      setError(null);
    } else {
      setError(result.error);
    }
  };

  const stop = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    if (audioProcessorRef.current) {
      audioProcessorRef.current.stop();
    }
    setIsInitialized(false);
  };

  useEffect(() => {
    if (isInitialized && audioProcessorRef.current) {
      // Update decibels at specified interval
      intervalRef.current = setInterval(() => {
        const db = audioProcessorRef.current.getDecibels();
        setDecibels(db);
      }, updateInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isInitialized, updateInterval]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, []);

  return {
    decibels,
    isInitialized,
    error,
    initialize,
    stop,
    alertStatus,      // Expose alert status
    bufferSize        // Expose buffer size for debugging
  };
};
```

**Step 4: Test integration**

Start frontend and backend:
```bash
cd backend && python app.py &
cd frontend && npm start
```

Open browser console and verify:
1. Email config is fetched
2. Buffer size increases during lunch hours
3. No errors in console

**Step 5: Commit**

```bash
git add frontend/src/hooks/useAudioLevel.js frontend/src/App.js
git commit -m "feat(integration): connect email alerts to audio monitoring

Integrate useEmailAlerts hook with audio level monitoring.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Frontend UI - Email Configuration Panel

**Files:**
- Create: `frontend/src/components/EmailConfigPanel.js`
- Modify: `frontend/src/components/ConfigPanel.js` (to include EmailConfigPanel)

**Step 1: Create EmailConfigPanel component**

Create `frontend/src/components/EmailConfigPanel.js`:

```javascript
import React, { useState } from 'react';

const EmailConfigPanel = ({ emailConfig, onSave, onTest }) => {
  const [localConfig, setLocalConfig] = useState(emailConfig || {
    enabled: false,
    recipient: 'richardalbinana@asvalencia.org',
    smtp_host: '172.17.50.100',
    smtp_port: 25,
    instant_threshold_db: 85,
    average_threshold_db: 75,
    average_time_window_minutes: 5,
    cooldown_minutes: 5
  });

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');

  const handleChange = (field, value) => {
    setLocalConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');

    try {
      await onSave(localConfig);
      setMessage('Email settings saved successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('Failed to save settings: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setMessage('');

    try {
      const response = await fetch('/api/email-alert/test', {
        method: 'POST'
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setMessage('Test email sent successfully!');
      } else {
        setMessage('Test email failed: ' + data.message);
      }
    } catch (error) {
      setMessage('Test email failed: ' + error.message);
    } finally {
      setTesting(false);
      setTimeout(() => setMessage(''), 5000);
    }
  };

  return (
    <div className="email-config-panel">
      <h3>Email Alerts</h3>

      <div className="form-group">
        <label>
          <input
            type="checkbox"
            checked={localConfig.enabled}
            onChange={(e) => handleChange('enabled', e.target.checked)}
          />
          Enable Email Alerts
        </label>
      </div>

      {localConfig.enabled && (
        <>
          <div className="form-group">
            <label>Email Recipient</label>
            <input
              type="email"
              value={localConfig.recipient}
              onChange={(e) => handleChange('recipient', e.target.value)}
              placeholder="richardalbinana@asvalencia.org"
            />
          </div>

          <div className="threshold-section">
            <h4>Instant Alert Threshold</h4>
            <p className="description">
              Send email immediately when sound exceeds this level
            </p>
            <div className="slider-group">
              <label>
                Threshold: {localConfig.instant_threshold_db} dB
              </label>
              <input
                type="range"
                min="60"
                max="100"
                step="1"
                value={localConfig.instant_threshold_db}
                onChange={(e) => handleChange('instant_threshold_db', parseFloat(e.target.value))}
              />
            </div>
          </div>

          <div className="threshold-section">
            <h4>Average Alert Threshold</h4>
            <p className="description">
              Send email when average over time window exceeds this level
            </p>
            <div className="slider-group">
              <label>
                Threshold: {localConfig.average_threshold_db} dB
              </label>
              <input
                type="range"
                min="60"
                max="100"
                step="1"
                value={localConfig.average_threshold_db}
                onChange={(e) => handleChange('average_threshold_db', parseFloat(e.target.value))}
              />
            </div>

            <div className="form-group">
              <label>Time Window (minutes)</label>
              <input
                type="number"
                min="1"
                max="30"
                value={localConfig.average_time_window_minutes}
                onChange={(e) => handleChange('average_time_window_minutes', parseInt(e.target.value))}
              />
              <span className="help-text">
                Average must be within one 30-minute time slot
              </span>
            </div>
          </div>

          <div className="form-group">
            <label>Cooldown Period (minutes)</label>
            <input
              type="number"
              min="1"
              max="60"
              value={localConfig.cooldown_minutes}
              onChange={(e) => handleChange('cooldown_minutes', parseInt(e.target.value))}
            />
            <span className="help-text">
              Minimum time between alerts of the same type
            </span>
          </div>

          <details
            className="advanced-settings"
            open={showAdvanced}
            onToggle={(e) => setShowAdvanced(e.target.open)}
          >
            <summary>Advanced SMTP Settings</summary>
            <div className="form-group">
              <label>SMTP Host</label>
              <input
                type="text"
                value={localConfig.smtp_host}
                onChange={(e) => handleChange('smtp_host', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>SMTP Port</label>
              <input
                type="number"
                value={localConfig.smtp_port}
                onChange={(e) => handleChange('smtp_port', parseInt(e.target.value))}
              />
            </div>
          </details>

          <div className="button-group">
            <button
              onClick={handleSave}
              className="btn-primary"
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Email Settings'}
            </button>

            <button
              onClick={handleTest}
              className="btn-secondary"
              disabled={testing}
            >
              {testing ? 'Sending...' : 'Send Test Email'}
            </button>
          </div>

          {message && (
            <div className={`message ${message.includes('success') ? 'success' : 'error'}`}>
              {message}
            </div>
          )}
        </>
      )}

      <style jsx>{`
        .email-config-panel {
          padding: 20px;
          background: #f5f5f5;
          border-radius: 8px;
          margin-top: 20px;
        }

        h3 {
          margin-top: 0;
          color: #333;
        }

        h4 {
          margin-top: 20px;
          margin-bottom: 5px;
          color: #555;
        }

        .form-group {
          margin-bottom: 15px;
        }

        .form-group label {
          display: block;
          margin-bottom: 5px;
          font-weight: 500;
          color: #333;
        }

        .form-group input[type="text"],
        .form-group input[type="email"],
        .form-group input[type="number"] {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
        }

        .form-group input[type="checkbox"] {
          margin-right: 8px;
        }

        .description {
          font-size: 13px;
          color: #666;
          margin-bottom: 10px;
        }

        .help-text {
          display: block;
          font-size: 12px;
          color: #777;
          margin-top: 5px;
        }

        .slider-group {
          margin-bottom: 15px;
        }

        .slider-group input[type="range"] {
          width: 100%;
          margin-top: 5px;
        }

        .threshold-section {
          background: white;
          padding: 15px;
          border-radius: 6px;
          margin-bottom: 15px;
        }

        .advanced-settings {
          background: white;
          padding: 15px;
          border-radius: 6px;
          margin-bottom: 15px;
        }

        .advanced-settings summary {
          cursor: pointer;
          font-weight: 500;
          color: #555;
        }

        .button-group {
          display: flex;
          gap: 10px;
          margin-top: 20px;
        }

        .btn-primary,
        .btn-secondary {
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          font-size: 14px;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .btn-primary {
          background: #4caf50;
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: #45a049;
        }

        .btn-secondary {
          background: #2196f3;
          color: white;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #0b7dda;
        }

        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .message {
          margin-top: 15px;
          padding: 10px;
          border-radius: 4px;
          font-size: 14px;
        }

        .message.success {
          background: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }

        .message.error {
          background: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }
      `}</style>
    </div>
  );
};

export default EmailConfigPanel;
```

**Step 2: Integrate EmailConfigPanel into ConfigPanel**

Modify `frontend/src/components/ConfigPanel.js` to include the new panel. Find where other config sections are rendered and add:

```javascript
import EmailConfigPanel from './EmailConfigPanel';

// Inside the ConfigPanel component, add:

const handleSaveEmailConfig = async (emailConfig) => {
  try {
    const response = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_alerts: emailConfig })
    });

    if (!response.ok) {
      throw new Error('Failed to save email configuration');
    }

    const data = await response.json();
    // Update parent state if needed
    onConfigUpdate && onConfigUpdate(data);
  } catch (error) {
    throw error;
  }
};

// In the render/return:
<EmailConfigPanel
  emailConfig={config.email_alerts}
  onSave={handleSaveEmailConfig}
/>
```

**Step 3: Test UI in browser**

Start frontend:
```bash
cd frontend && npm start
```

Verify:
1. Email config panel appears in settings
2. Toggle enable/disable works
3. Sliders adjust thresholds
4. Save button updates config
5. Test button sends test email

**Step 4: Commit**

```bash
git add frontend/src/components/EmailConfigPanel.js frontend/src/components/ConfigPanel.js
git commit -m "feat(ui): add email configuration panel

Implement UI for email alert settings with test functionality.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 10: Documentation and Final Testing

**Files:**
- Create: `docs/EMAIL_ALERTS.md`
- Update: `README.md` (if exists)

**Step 1: Create email alerts documentation**

Create `docs/EMAIL_ALERTS.md`:

```markdown
# Email Alerts System

## Overview

The Sound Meter application includes an email alert system that notifies administrators when noise levels exceed configurable thresholds.

## Features

- **Two Alert Types:**
  - Instant: Triggers when a single reading exceeds threshold
  - Average: Triggers when rolling average over time window exceeds threshold

- **Configurable Settings:**
  - Email recipient
  - SMTP server (host and port)
  - Instant threshold (dB)
  - Average threshold (dB)
  - Average time window (minutes)
  - Cooldown period between alerts (minutes)

- **Detailed Email Content:**
  - Alert type and current readings
  - Period statistics (peak, average, zone percentages)
  - Recent history (last 5 readings)

## Configuration

### Via UI

Navigate to Settings > Email Alerts section:

1. Enable email alerts checkbox
2. Set email recipient address
3. Configure instant threshold (default: 85 dB)
4. Configure average threshold (default: 75 dB)
5. Set average time window (default: 5 minutes)
6. Set cooldown period (default: 5 minutes)
7. Click "Save Email Settings"

### Test Email

Click "Send Test Email" button to verify SMTP configuration. A sample alert email will be sent immediately (bypasses cooldown).

### Advanced Settings

Expand "Advanced SMTP Settings" to configure:
- SMTP Host (default: 172.17.50.100)
- SMTP Port (default: 25)

## How It Works

### Frontend (Threshold Checking)

1. Every visual update (0.5-1 second), current dB reading is measured
2. Reading is added to rolling buffer
3. Buffer is filtered to keep only readings within time window
4. If time slot boundary is crossed (e.g., 12:00), buffer is cleared
5. Instant threshold: Check if current reading exceeds threshold
6. Average threshold: Calculate average of buffer, check if exceeds threshold
7. If threshold exceeded and not in cooldown, call backend API

### Backend (Email Sending)

1. Verify email alerts are enabled
2. Check cooldown period (no duplicate alerts within cooldown)
3. Fetch period statistics from database
4. Construct email with detailed content (HTML + plain text)
5. Send via SMTP (no authentication required, IP whitelisted)
6. Update last alert timestamp in database
7. Return success with next available alert time

### Cooldown Mechanism

- Each alert type (instant/average) has independent cooldown timer
- Default: 5 minutes between alerts of same type
- Prevents email spam during sustained high noise
- Timer persists across UI refreshes and server restarts
- Frontend tracks local cooldown to avoid unnecessary API calls

### Time Slot Boundaries

- Average calculations never cross time slot boundaries
- Buffer is cleared when time slot changes (e.g., 11:59 → 12:00)
- Average alerts cannot trigger until buffer refills with enough data
- Example: If average window is 5 minutes and slot changes at 12:00, average alert cannot trigger until 12:05

## Email Format

### Subject Line

```
[Sound Alert] {Instant|Average} threshold exceeded - {Time Slot Name} (YYYY-MM-DD HH:MM:SS)
```

### Body Content

- Alert type and timestamp
- Current decibel level
- Threshold value
- Amount exceeded
- Period statistics (peak, average, zone percentages)
- Recent history (last 5 readings with timestamps)

## SMTP Configuration

### Default Settings

- Host: 172.17.50.100
- Port: 25
- Authentication: None (IP whitelisted)

### Network Requirements

The backend server must have network access to the SMTP server. If running in Docker, ensure the container network allows outbound connections to port 25.

### Troubleshooting

1. **Test SMTP connection:**
   ```bash
   telnet 172.17.50.100 25
   ```

2. **Check backend logs:**
   ```bash
   tail -f backend.log | grep email
   ```

3. **Use Test Email button:**
   - Bypasses cooldown and threshold checks
   - Verifies SMTP connectivity and email delivery

## Database Schema

Email configuration is stored in the `config` table:

```
email_enabled: "true" | "false"
email_recipient: email address
smtp_host: SMTP server hostname
smtp_port: SMTP server port
instant_threshold_db: threshold in dB
average_threshold_db: threshold in dB
average_time_window_minutes: window size in minutes
cooldown_minutes: cooldown period in minutes
last_instant_alert_sent: ISO8601 timestamp
last_average_alert_sent: ISO8601 timestamp
```

## API Endpoints

### POST /api/email-alert

Send an email alert (called by frontend when threshold exceeded).

**Request:**
```json
{
  "alert_type": "instant" | "average",
  "current_db": 87.5,
  "average_db": 82.3,
  "timestamp": "2026-02-02T12:15:45+01:00",
  "time_slot_id": 1
}
```

**Response (success):**
```json
{
  "success": true,
  "message": "Alert email sent successfully",
  "next_alert_available_at": "2026-02-02T12:20:45+01:00"
}
```

**Response (cooldown):**
```json
{
  "success": false,
  "message": "Alert in cooldown period",
  "next_alert_available_at": "2026-02-02T12:20:45+01:00",
  "seconds_remaining": 180
}
```

### POST /api/email-alert/test

Send a test email (bypasses cooldown and threshold checks).

**Response:**
```json
{
  "success": true,
  "message": "Test email sent to richardalbinana@asvalencia.org"
}
```

### GET /api/config

Returns configuration including `email_alerts` section:

```json
{
  "thresholds": {...},
  "time_slots": [...],
  "zones": [...],
  "email_alerts": {
    "enabled": true,
    "recipient": "richardalbinana@asvalencia.org",
    "smtp_host": "172.17.50.100",
    "smtp_port": 25,
    "instant_threshold_db": 85.0,
    "average_threshold_db": 75.0,
    "average_time_window_minutes": 5,
    "cooldown_minutes": 5
  }
}
```

### POST /api/config

Update email configuration:

```json
{
  "email_alerts": {
    "enabled": true,
    "recipient": "newemail@example.com",
    "instant_threshold_db": 90.0
  }
}
```

## Deployment Notes

1. **SMTP Access:** Verify backend can reach 172.17.50.100:25
2. **Docker Network:** May need `--network=host` or custom network config
3. **Database Migration:** Existing databases automatically get email config on next init
4. **Default State:** Email alerts are disabled by default (must enable via UI)

## Future Enhancements

- Multiple email recipients
- SMS alerts
- Alert history log
- Configurable email templates
- Digest emails (end of lunch period summary)
```

**Step 2: Run full integration test**

Manual integration test checklist:

```bash
# 1. Start backend
cd backend && python app.py

# 2. Start frontend
cd frontend && npm start

# 3. Open browser to http://localhost:3000

# 4. Navigate to Settings

# 5. Enable email alerts

# 6. Click "Send Test Email"
# Expected: Success message, check email inbox

# 7. Set instant threshold to 60 dB (low for testing)

# 8. Save settings

# 9. Initialize audio and generate noise above 60 dB
# Expected: Email received within seconds

# 10. Generate more noise immediately
# Expected: No email (cooldown active)

# 11. Wait for cooldown period (5 minutes)

# 12. Generate noise again
# Expected: Email received

# 13. Check browser console for any errors

# 14. Verify buffer size increases during lunch hours

# 15. Test at time slot boundary (e.g., 11:59 → 12:00)
# Expected: Buffer clears, no errors
```

**Step 3: Commit documentation**

```bash
git add docs/EMAIL_ALERTS.md
git commit -m "docs: add comprehensive email alerts documentation

Document configuration, API, troubleshooting, and deployment.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 11: Final Commit and Deployment

**Step 1: Run all tests**

```bash
cd backend && python -m pytest -v
```

Expected: All tests pass

**Step 2: Create migration script for existing installations**

Create `backend/migrate_email_config.py`:

```python
#!/usr/bin/env python3
"""
Migration script to add email configuration to existing databases
Run this on existing installations to add email alert functionality
"""

from database import init_db
import sys

def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else 'soundmeter.db'

    print(f"Migrating database: {db_path}")
    print("Adding email configuration...")

    try:
        init_db(db_path)
        print("✓ Migration completed successfully")
        print("Email alerts are disabled by default - enable via Settings UI")
    except Exception as e:
        print(f"✗ Migration failed: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
```

Make executable:
```bash
chmod +x backend/migrate_email_config.py
```

**Step 3: Update deployment documentation**

If README.md exists, add section about email alerts, otherwise skip.

**Step 4: Final commit**

```bash
git add backend/migrate_email_config.py
git commit -m "feat: add email alert system

Complete implementation of configurable email notifications:
- Instant and average threshold alerts
- Rolling buffer with time slot boundary handling
- Cooldown mechanism to prevent spam
- Detailed email content with statistics
- UI for configuration and testing
- Full API integration

SMTP: 172.17.50.100:25 (no auth)
Default recipient: richardalbinana@asvalencia.org

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

**Step 5: Push to repository (if applicable)**

```bash
git push origin main
```

---

## Implementation Complete

All tasks completed! The email alert system is now fully integrated.

### Summary of Changes:

**Backend:**
- Database schema with email configuration
- Email service (SMTP sending with HTML/plain text)
- Statistics service (period calculations)
- Email alerts API endpoints
- Extended config API with email_alerts section

**Frontend:**
- Time slot detection utility
- useEmailAlerts hook (rolling buffer, threshold checking)
- Integration with audio monitoring
- Email configuration UI panel
- Test email functionality

**Documentation:**
- Comprehensive user guide
- API documentation
- Troubleshooting guide
- Deployment notes

### Deployment Checklist:

- [ ] Backend can reach SMTP server (172.17.50.100:25)
- [ ] Run migration script on existing databases
- [ ] Enable email alerts via UI
- [ ] Send test email to verify delivery
- [ ] Monitor backend logs for SMTP errors
- [ ] Test during actual lunch hours (11:30-13:30)
