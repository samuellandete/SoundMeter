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

    # Create zones table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS zones (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL
        )
    ''')

    # Create time_slots table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS time_slots (
            id INTEGER PRIMARY KEY,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            name TEXT NOT NULL
        )
    ''')

    # Create sound_logs table with zone_id
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sound_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME NOT NULL,
            decibels REAL NOT NULL,
            time_slot_id INTEGER NOT NULL,
            zone_id INTEGER,
            FOREIGN KEY (time_slot_id) REFERENCES time_slots(id),
            FOREIGN KEY (zone_id) REFERENCES zones(id)
        )
    ''')

    # Create config table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    ''')

    # Insert default zones
    cursor.execute('SELECT COUNT(*) FROM zones')
    if cursor.fetchone()[0] == 0:
        default_zones = [
            (1, 'Zone 1'),
            (2, 'Zone 2'),
            (3, 'Zone 3'),
            (4, 'Zone 4'),
            (5, 'Zone 5')
        ]
        cursor.executemany(
            'INSERT INTO zones (id, name) VALUES (?, ?)',
            default_zones
        )

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

    # Migration: Add zone_id column to sound_logs if it doesn't exist
    cursor.execute("PRAGMA table_info(sound_logs)")
    columns = [row[1] for row in cursor.fetchall()]
    if 'zone_id' not in columns:
        cursor.execute('ALTER TABLE sound_logs ADD COLUMN zone_id INTEGER')

    # Insert default config
    cursor.execute('SELECT COUNT(*) FROM config')
    if cursor.fetchone()[0] == 0:
        default_config = {
            'thresholds': json.dumps({'orange_threshold': 60, 'red_threshold': 80}),
            'visual_update_rate': '1000',
            'calibration_offset': '0',  # dB offset for microphone calibration
            # Email alert settings
            'email_enabled': 'false',
            'email_recipient': 'richardalbinana@asvalencia.org',
            'smtp_host': '172.17.50.100',
            'smtp_port': '25',
            'instant_threshold_db': '100.0',
            'average_threshold_db': '90.0',
            'average_time_window_minutes': '5',
            'cooldown_minutes': '5',
            'last_instant_alert_sent': '',
            'last_average_alert_sent': ''
        }
        for key, value in default_config.items():
            cursor.execute('INSERT INTO config (key, value) VALUES (?, ?)', (key, value))

    # Ensure calibration_offset exists (for existing databases)
    cursor.execute('SELECT COUNT(*) FROM config WHERE key = ?', ('calibration_offset',))
    if cursor.fetchone()[0] == 0:
        cursor.execute('INSERT INTO config (key, value) VALUES (?, ?)', ('calibration_offset', '0'))

    conn.commit()
    close_db(conn)
