import pytest
import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from database import get_db, init_db, close_db

def test_database_initialization():
    """Test that database initializes with correct schema"""
    db_path = 'test_soundmeter.db'

    # Clean up any existing test db
    if os.path.exists(db_path):
        os.remove(db_path)

    # Initialize database
    init_db(db_path)

    # Check tables exist
    conn = get_db(db_path)
    cursor = conn.cursor()

    # Check time_slots table
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='time_slots'")
    assert cursor.fetchone() is not None

    # Check sound_logs table
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sound_logs'")
    assert cursor.fetchone() is not None

    # Check config table
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='config'")
    assert cursor.fetchone() is not None

    close_db(conn)
    os.remove(db_path)
