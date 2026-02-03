import pytest
import json
import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from database import init_db

@pytest.fixture
def client():
    app.config['TESTING'] = True
    os.environ['DATABASE_PATH'] = 'test_api.db'

    # Initialize test database
    init_db('test_api.db')

    with app.test_client() as client:
        yield client

    # Cleanup
    if os.path.exists('test_api.db'):
        os.remove('test_api.db')

def test_get_config(client):
    """Test GET /api/config returns configuration"""
    response = client.get('/api/config')
    assert response.status_code == 200

    data = json.loads(response.data)
    assert 'thresholds' in data
    assert 'visual_update_rate' in data
    assert 'time_slots' in data

    # Check default thresholds
    assert data['thresholds']['orange_threshold'] == 60
    assert data['thresholds']['red_threshold'] == 80

    # Check time slots
    assert len(data['time_slots']) == 4
    assert data['time_slots'][0]['name'] == 'Period 1'

def test_get_config_includes_email_alerts(client):
    """Test GET /api/config includes email_alerts section"""
    response = client.get('/api/config')
    assert response.status_code == 200

    data = json.loads(response.data)
    assert 'email_alerts' in data

    email_config = data['email_alerts']
    assert 'enabled' in email_config
    assert 'recipient' in email_config
    assert 'smtp_host' in email_config
    assert 'smtp_port' in email_config
    assert 'instant_threshold_db' in email_config
    assert 'average_threshold_db' in email_config
    assert 'average_time_window_minutes' in email_config
    assert 'cooldown_minutes' in email_config

    # Check default values
    assert email_config['enabled'] == False
    assert email_config['recipient'] == 'richardalbinana@asvalencia.org'
    assert email_config['smtp_host'] == '172.17.50.100'
    assert email_config['smtp_port'] == 25
    assert email_config['instant_threshold_db'] == 100.0
    assert email_config['average_threshold_db'] == 90.0
    assert email_config['average_time_window_minutes'] == 5
    assert email_config['cooldown_minutes'] == 5

def test_update_config_email_alerts(client):
    """Test POST /api/config can update email_alerts settings"""
    update_data = {
        'email_alerts': {
            'enabled': True,
            'recipient': 'test@example.com',
            'smtp_host': '192.168.1.100',
            'smtp_port': 587,
            'instant_threshold_db': 90.0,
            'average_threshold_db': 80.0,
            'average_time_window_minutes': 10,
            'cooldown_minutes': 15
        }
    }

    response = client.post('/api/config',
                          data=json.dumps(update_data),
                          content_type='application/json')
    assert response.status_code == 200

    data = json.loads(response.data)
    assert 'email_alerts' in data

    email_config = data['email_alerts']
    assert email_config['enabled'] == True
    assert email_config['recipient'] == 'test@example.com'
    assert email_config['smtp_host'] == '192.168.1.100'
    assert email_config['smtp_port'] == 587
    assert email_config['instant_threshold_db'] == 90.0
    assert email_config['average_threshold_db'] == 80.0
    assert email_config['average_time_window_minutes'] == 10
    assert email_config['cooldown_minutes'] == 15

def test_update_config_partial_email_alerts(client):
    """Test POST /api/config can update partial email_alerts settings"""
    update_data = {
        'email_alerts': {
            'enabled': True,
            'instant_threshold_db': 88.0
        }
    }

    response = client.post('/api/config',
                          data=json.dumps(update_data),
                          content_type='application/json')
    assert response.status_code == 200

    data = json.loads(response.data)
    email_config = data['email_alerts']

    # Updated fields
    assert email_config['enabled'] == True
    assert email_config['instant_threshold_db'] == 88.0

    # Unchanged fields should retain defaults
    assert email_config['recipient'] == 'richardalbinana@asvalencia.org'
    assert email_config['smtp_host'] == '172.17.50.100'
