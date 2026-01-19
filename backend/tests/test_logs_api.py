import pytest
import json
import os
import sys
from datetime import datetime
import pytz
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from database import init_db

@pytest.fixture
def client():
    app.config['TESTING'] = True
    os.environ['DATABASE_PATH'] = 'test_logs.db'

    init_db('test_logs.db')

    with app.test_client() as client:
        yield client

    if os.path.exists('test_logs.db'):
        os.remove('test_logs.db')

def test_post_log_within_hours(client):
    """Test POST /api/logs accepts logs during lunch hours"""
    # Create a timestamp within lunch hours (CET)
    cet = pytz.timezone('Europe/Paris')
    timestamp = cet.localize(datetime(2026, 1, 19, 11, 45, 0))

    response = client.post('/api/logs',
        json={
            'timestamp': timestamp.isoformat(),
            'decibels': 65.5
        })

    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['success'] == True

def test_post_log_outside_hours(client):
    """Test POST /api/logs rejects logs outside lunch hours"""
    cet = pytz.timezone('Europe/Paris')
    timestamp = cet.localize(datetime(2026, 1, 19, 10, 0, 0))

    response = client.post('/api/logs',
        json={
            'timestamp': timestamp.isoformat(),
            'decibels': 65.5
        })

    assert response.status_code == 400
    data = json.loads(response.data)
    assert data['success'] == False
    assert 'outside recording hours' in data['message'].lower()
