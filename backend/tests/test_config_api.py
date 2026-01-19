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
