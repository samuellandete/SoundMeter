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
