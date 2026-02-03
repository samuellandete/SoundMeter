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

    with patch('routes.email_alerts.send_alert_email') as mock_send:
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

    with patch('routes.email_alerts.send_alert_email') as mock_send:
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

    with patch('routes.email_alerts.send_alert_email') as mock_send:
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

    with patch('routes.email_alerts.send_alert_email') as mock_send:
        mock_send.return_value = (True, "Email sent successfully")

        response = client.post('/api/email-alert/test')

        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
        mock_send.assert_called_once()
