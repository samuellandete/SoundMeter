import sqlite3
import json
from contextlib import contextmanager

def get_db(db_path='soundmeter.db'):
    """Get database connection"""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def close_db(conn):
    """Close database connection"""
    if conn:
        conn.close()

@contextmanager
def get_db_context(db_path='soundmeter.db'):
    """Context manager for database connections"""
    conn = get_db(db_path)
    try:
        yield conn
    finally:
        close_db(conn)

def init_db(db_path='soundmeter.db'):
    """Initialize database with schema"""
    conn = get_db(db_path)
    cursor = conn.cursor()

    # Create time_slots table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS time_slots (
            id INTEGER PRIMARY KEY,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            name TEXT NOT NULL
        )
    ''')

    # Create sound_logs table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sound_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME NOT NULL,
            decibels REAL NOT NULL,
            time_slot_id INTEGER NOT NULL,
            FOREIGN KEY (time_slot_id) REFERENCES time_slots(id)
        )
    ''')

    # Create config table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    ''')

    # Insert default time slots
    cursor.execute('SELECT COUNT(*) FROM time_slots')
    if cursor.fetchone()[0] == 0:
        default_slots = [
            (1, '11:30:00', '12:00:00', 'Period 1'),
            (2, '12:00:00', '12:30:00', 'Period 2'),
            (3, '12:30:00', '13:00:00', 'Period 3'),
            (4, '13:00:00', '13:30:00', 'Period 4')
        ]
        cursor.executemany(
            'INSERT INTO time_slots (id, start_time, end_time, name) VALUES (?, ?, ?, ?)',
            default_slots
        )

    # Insert default config
    cursor.execute('SELECT COUNT(*) FROM config')
    if cursor.fetchone()[0] == 0:
        default_config = {
            'thresholds': json.dumps({'orange_threshold': 60, 'red_threshold': 80}),
            'visual_update_rate': '1000',
            'calibration_offset': '0'  # dB offset for microphone calibration
        }
        for key, value in default_config.items():
            cursor.execute('INSERT INTO config (key, value) VALUES (?, ?)', (key, value))

    # Ensure calibration_offset exists (for existing databases)
    cursor.execute('SELECT COUNT(*) FROM config WHERE key = ?', ('calibration_offset',))
    if cursor.fetchone()[0] == 0:
        cursor.execute('INSERT INTO config (key, value) VALUES (?, ?)', ('calibration_offset', '0'))

    conn.commit()
    close_db(conn)
