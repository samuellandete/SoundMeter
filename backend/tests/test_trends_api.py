import pytest
import json
import os
import sys
from datetime import datetime
import pytz

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from database import init_db, get_db_context


@pytest.fixture
def client():
    app.config['TESTING'] = True
    db_path = 'test_trends_api.db'
    os.environ['DATABASE_PATH'] = db_path

    init_db(db_path)

    # Insert test data
    cet = pytz.timezone('Europe/Paris')
    with get_db_context(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)",
            ('thresholds', '{"orange_threshold": 60, "red_threshold": 80}')
        )

        test_logs = [
            (cet.localize(datetime(2026, 1, 6, 11, 35, 0)).isoformat(), 55.0, 1, 1),
            (cet.localize(datetime(2026, 1, 6, 11, 45, 0)).isoformat(), 65.0, 1, 1),
            (cet.localize(datetime(2026, 1, 6, 11, 55, 0)).isoformat(), 85.0, 1, 1),
        ]

        for ts, db, slot, zone in test_logs:
            cursor.execute(
                'INSERT INTO sound_logs (timestamp, decibels, time_slot_id, zone_id) VALUES (?, ?, ?, ?)',
                (ts, db, slot, zone)
            )
        conn.commit()

    with app.test_client() as client:
        yield client

    if os.path.exists(db_path):
        os.remove(db_path)


def test_get_trends_day(client):
    """Test GET /api/trends with day granularity"""
    response = client.get('/api/trends?granularity=day&start_date=2026-01-06&end_date=2026-01-06')

    assert response.status_code == 200
    data = json.loads(response.data)

    assert data['granularity'] == 'day'
    assert 'thresholds' in data
    assert 'periods' in data
    assert len(data['periods']) == 1


def test_get_trends_missing_params(client):
    """Test GET /api/trends with missing parameters"""
    response = client.get('/api/trends?granularity=day')

    assert response.status_code == 400
    data = json.loads(response.data)
    assert 'error' in data


def test_get_trends_invalid_granularity(client):
    """Test GET /api/trends with invalid granularity"""
    response = client.get('/api/trends?granularity=invalid&start_date=2026-01-06&end_date=2026-01-06')

    assert response.status_code == 400


def test_get_trends_with_filters(client):
    """Test GET /api/trends with slot and zone filters"""
    response = client.get('/api/trends?granularity=day&start_date=2026-01-06&end_date=2026-01-06&slots=1&zones=1')

    assert response.status_code == 200
    data = json.loads(response.data)
    assert len(data['periods']) == 1
