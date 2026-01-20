#!/bin/bash
set -e

# Initialize database if it doesn't exist
DB_PATH="${DATABASE_PATH:-soundmeter.db}"
DB_DIR=$(dirname "$DB_PATH")

# Create directory if needed (for paths like data/soundmeter.db)
if [ "$DB_DIR" != "." ] && [ ! -d "$DB_DIR" ]; then
    echo "Creating directory $DB_DIR..."
    mkdir -p "$DB_DIR"
fi

# Initialize if file doesn't exist OR is empty
if [ ! -f "$DB_PATH" ] || [ ! -s "$DB_PATH" ]; then
    echo "Initializing database at $DB_PATH..."
    python init_db.py
fi

# Run the main command
exec "$@"
