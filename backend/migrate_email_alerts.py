#!/usr/bin/env python3
"""
Migration script to add email alerts configuration to existing Sound Meter databases

This script adds the email alert configuration keys to the config table
if they don't already exist. Safe to run multiple times.

Usage:
    python migrate_email_alerts.py [database_path]

If no database path is provided, uses the DATABASE_PATH environment variable
or defaults to 'soundmeter.db'
"""

import os
import sys
import sqlite3

def migrate_email_alerts(db_path):
    """Add email alert configuration to database"""

    print(f"Migrating database: {db_path}")

    if not os.path.exists(db_path):
        print(f"Error: Database not found at {db_path}")
        return False

    # Email configuration defaults
    email_config = {
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

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # Check which config keys already exist
        cursor.execute('SELECT key FROM config')
        existing_keys = {row[0] for row in cursor.fetchall()}

        # Add missing config keys
        added = 0
        for key, value in email_config.items():
            if key not in existing_keys:
                cursor.execute(
                    'INSERT INTO config (key, value) VALUES (?, ?)',
                    (key, value)
                )
                added += 1
                print(f"  ✓ Added config key: {key} = {value}")
            else:
                print(f"  - Skipped (exists): {key}")

        conn.commit()
        conn.close()

        if added > 0:
            print(f"\n✅ Migration successful! Added {added} configuration key(s).")
        else:
            print(f"\n✅ Database already up-to-date. No changes needed.")

        return True

    except sqlite3.Error as e:
        print(f"\n❌ Database error: {e}")
        return False
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        return False

def main():
    """Main entry point"""

    # Get database path from argument or environment
    if len(sys.argv) > 1:
        db_path = sys.argv[1]
    else:
        db_path = os.getenv('DATABASE_PATH', 'soundmeter.db')

    print("=" * 60)
    print("Sound Meter Email Alerts Migration")
    print("=" * 60)
    print()

    success = migrate_email_alerts(db_path)

    print()
    print("=" * 60)

    return 0 if success else 1

if __name__ == '__main__':
    sys.exit(main())
