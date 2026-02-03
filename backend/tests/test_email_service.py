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

def test_format_subject_instant():
    """Test subject formatting for instant alerts"""
    from services.email_service import format_subject

    subject = format_subject('instant', 87.5, None, 1)
    assert subject == "🚨 Sound Alert: Instant Threshold Exceeded (87.5 dB) - Period 1"

def test_format_subject_average():
    """Test subject formatting for average alerts"""
    from services.email_service import format_subject

    subject = format_subject('average', 82.3, 76.8, 2)
    assert subject == "⚠️ Sound Alert: Average Threshold Exceeded (76.8 dB avg) - Period 2"
