import pytest
import os
import sys
from datetime import datetime
import pytz
import csv
from io import StringIO
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from database import init_db, get_db_context

@pytest.fixture
def client():
    app.config['TESTING'] = True
    os.environ['DATABASE_PATH'] = 'test_export.db'

    init_db('test_export.db')

    # Insert test data
    cet = pytz.timezone('Europe/Paris')
    with get_db_context('test_export.db') as conn:
        cursor = conn.cursor()
        test_logs = [
            (cet.localize(datetime(2026, 1, 19, 11, 45, 0)).isoformat(), 65.5, 1),
            (cet.localize(datetime(2026, 1, 19, 12, 15, 0)).isoformat(), 72.3, 2),
        ]
        cursor.executemany(
            'INSERT INTO sound_logs (timestamp, decibels, time_slot_id) VALUES (?, ?, ?)',
            test_logs
        )
        conn.commit()

    with app.test_client() as client:
        yield client

    if os.path.exists('test_export.db'):
        os.remove('test_export.db')

def test_export_csv(client):
    """Test GET /api/export returns CSV file"""
    response = client.get('/api/export?date=2026-01-19&slots=1,2')

    assert response.status_code == 200
    assert response.headers['Content-Type'] == 'text/csv; charset=utf-8'
    assert 'attachment' in response.headers['Content-Disposition']

    # Parse CSV content
    csv_content = response.data.decode('utf-8')
    csv_reader = csv.DictReader(StringIO(csv_content))
    rows = list(csv_reader)

    assert len(rows) == 2
    assert 'timestamp' in rows[0]
    assert 'decibels' in rows[0]
    assert 'time_slot_name' in rows[0]
