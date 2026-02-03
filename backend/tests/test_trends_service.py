import pytest
import os
import sys
from datetime import datetime
import pytz

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from database import init_db, get_db_context
from services.trends_service import get_period_aggregations


@pytest.fixture
def test_db():
    """Create a test database with sample data"""
    db_path = 'test_trends.db'
    os.environ['DATABASE_PATH'] = db_path
    init_db(db_path)

    # Insert test data
    cet = pytz.timezone('Europe/Paris')
    with get_db_context(db_path) as conn:
        cursor = conn.cursor()

        # Set thresholds
        cursor.execute(
            "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)",
            ('thresholds', '{"orange_threshold": 60, "red_threshold": 80}')
        )

        # Insert logs for 2026-01-06 (Monday), zone 1, slot 1
        # 3 green (50, 55, 58), 2 orange (65, 70), 1 red (85)
        test_logs = [
            (cet.localize(datetime(2026, 1, 6, 11, 35, 0)).isoformat(), 50.0, 1, 1),
            (cet.localize(datetime(2026, 1, 6, 11, 40, 0)).isoformat(), 55.0, 1, 1),
            (cet.localize(datetime(2026, 1, 6, 11, 45, 0)).isoformat(), 58.0, 1, 1),
            (cet.localize(datetime(2026, 1, 6, 11, 50, 0)).isoformat(), 65.0, 1, 1),
            (cet.localize(datetime(2026, 1, 6, 11, 55, 0)).isoformat(), 70.0, 1, 1),
            (cet.localize(datetime(2026, 1, 6, 11, 58, 0)).isoformat(), 85.0, 1, 1),
        ]

        for ts, db, slot, zone in test_logs:
            cursor.execute(
                'INSERT INTO sound_logs (timestamp, decibels, time_slot_id, zone_id) VALUES (?, ?, ?, ?)',
                (ts, db, slot, zone)
            )
        conn.commit()

    yield db_path

    if os.path.exists(db_path):
        os.remove(db_path)


def test_get_period_aggregations_single_day(test_db):
    """Test aggregation for a single day"""
    result = get_period_aggregations(
        granularity='day',
        start_date='2026-01-06',
        end_date='2026-01-06',
        db_path=test_db
    )

    assert result['granularity'] == 'day'
    assert result['thresholds']['orange'] == 60
    assert result['thresholds']['red'] == 80
    assert len(result['periods']) == 1

    period = result['periods'][0]
    assert period['start'] == '2026-01-06'
    assert period['end'] == '2026-01-06'
    assert len(period['data']) == 1  # 1 zone+slot combo

    data = period['data'][0]
    assert data['zone_id'] == 1
    assert data['slot_id'] == 1
    assert data['reading_count'] == 6
    assert round(data['avg_db'], 1) == 63.8  # (50+55+58+65+70+85)/6
    assert data['peak_db'] == 85.0
    assert round(data['green_pct'], 1) == 50.0  # 3/6
    assert round(data['orange_pct'], 1) == 33.3  # 2/6
    assert round(data['red_pct'], 1) == 16.7  # 1/6


@pytest.fixture
def test_db_multiday():
    """Create a test database with data spanning multiple days and zones"""
    db_path = 'test_trends_multi.db'
    os.environ['DATABASE_PATH'] = db_path
    init_db(db_path)

    cet = pytz.timezone('Europe/Paris')
    with get_db_context(db_path) as conn:
        cursor = conn.cursor()

        cursor.execute(
            "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)",
            ('thresholds', '{"orange_threshold": 60, "red_threshold": 80}')
        )

        # Insert data for multiple days, zones, slots
        test_data = [
            # Day 1 (Mon Jan 6), Zone 1, Slot 1
            (cet.localize(datetime(2026, 1, 6, 11, 35, 0)).isoformat(), 55.0, 1, 1),
            (cet.localize(datetime(2026, 1, 6, 11, 45, 0)).isoformat(), 60.0, 1, 1),
            # Day 1, Zone 1, Slot 2
            (cet.localize(datetime(2026, 1, 6, 12, 15, 0)).isoformat(), 70.0, 2, 1),
            # Day 1, Zone 2, Slot 1
            (cet.localize(datetime(2026, 1, 6, 11, 40, 0)).isoformat(), 65.0, 1, 2),
            # Day 2 (Tue Jan 7), Zone 1, Slot 1
            (cet.localize(datetime(2026, 1, 7, 11, 35, 0)).isoformat(), 58.0, 1, 1),
            (cet.localize(datetime(2026, 1, 7, 11, 45, 0)).isoformat(), 62.0, 1, 1),
            # Day 8 (Mon Jan 13) - second week, Zone 1, Slot 1
            (cet.localize(datetime(2026, 1, 13, 11, 35, 0)).isoformat(), 52.0, 1, 1),
        ]

        for ts, db, slot, zone in test_data:
            cursor.execute(
                'INSERT INTO sound_logs (timestamp, decibels, time_slot_id, zone_id) VALUES (?, ?, ?, ?)',
                (ts, db, slot, zone)
            )
        conn.commit()

    yield db_path

    if os.path.exists(db_path):
        os.remove(db_path)


def test_get_period_aggregations_multiple_days(test_db_multiday):
    """Test aggregation across multiple days"""
    result = get_period_aggregations(
        granularity='day',
        start_date='2026-01-06',
        end_date='2026-01-07',
        db_path=test_db_multiday
    )

    assert len(result['periods']) == 2  # Two days with data
    assert result['periods'][0]['start'] == '2026-01-06'
    assert result['periods'][1]['start'] == '2026-01-07'


def test_get_period_aggregations_week(test_db_multiday):
    """Test weekly aggregation"""
    result = get_period_aggregations(
        granularity='week',
        start_date='2026-01-06',
        end_date='2026-01-13',
        db_path=test_db_multiday
    )

    assert result['granularity'] == 'week'
    assert len(result['periods']) == 2  # Two weeks


def test_get_period_aggregations_with_zone_filter(test_db_multiday):
    """Test filtering by zone"""
    result = get_period_aggregations(
        granularity='day',
        start_date='2026-01-06',
        end_date='2026-01-06',
        zone_ids=[1],
        db_path=test_db_multiday
    )

    # Should only have zone 1 data
    for period in result['periods']:
        for data in period['data']:
            assert data['zone_id'] == 1


def test_get_period_aggregations_with_slot_filter(test_db_multiday):
    """Test filtering by time slot"""
    result = get_period_aggregations(
        granularity='day',
        start_date='2026-01-06',
        end_date='2026-01-06',
        slot_ids=[1],
        db_path=test_db_multiday
    )

    # Should only have slot 1 data
    for period in result['periods']:
        for data in period['data']:
            assert data['slot_id'] == 1
