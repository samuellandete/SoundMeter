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

def test_email_config_defaults():
    """Test that email configuration is initialized with defaults"""
    import os
    import tempfile
    from database import init_db, get_db_context

    # Create temporary database
    fd, db_path = tempfile.mkstemp()
    os.close(fd)

    try:
        init_db(db_path)

        with get_db_context(db_path) as conn:
            cursor = conn.cursor()

            # Check email_enabled exists
            cursor.execute("SELECT value FROM config WHERE key = 'email_enabled'")
            result = cursor.fetchone()
            assert result is not None
            assert result['value'] == 'false'

            # Check email_recipient exists
            cursor.execute("SELECT value FROM config WHERE key = 'email_recipient'")
            result = cursor.fetchone()
            assert result is not None
            assert result['value'] == 'richardalbinana@asvalencia.org'

            # Check smtp_host exists
            cursor.execute("SELECT value FROM config WHERE key = 'smtp_host'")
            result = cursor.fetchone()
            assert result is not None
            assert result['value'] == '172.17.50.100'

            # Check smtp_port exists
            cursor.execute("SELECT value FROM config WHERE key = 'smtp_port'")
            result = cursor.fetchone()
            assert result is not None
            assert result['value'] == '25'

            # Check instant_threshold_db exists
            cursor.execute("SELECT value FROM config WHERE key = 'instant_threshold_db'")
            result = cursor.fetchone()
            assert result is not None
            assert float(result['value']) == 100.0

            # Check average_threshold_db exists
            cursor.execute("SELECT value FROM config WHERE key = 'average_threshold_db'")
            result = cursor.fetchone()
            assert result is not None
            assert float(result['value']) == 90.0

            # Check average_time_window_minutes exists
            cursor.execute("SELECT value FROM config WHERE key = 'average_time_window_minutes'")
            result = cursor.fetchone()
            assert result is not None
            assert int(result['value']) == 5

            # Check cooldown_minutes exists
            cursor.execute("SELECT value FROM config WHERE key = 'cooldown_minutes'")
            result = cursor.fetchone()
            assert result is not None
            assert int(result['value']) == 5

    finally:
        os.unlink(db_path)
