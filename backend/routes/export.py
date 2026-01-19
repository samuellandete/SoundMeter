from flask import Blueprint, Response
from datetime import datetime
import csv
from io import StringIO
from database import get_db_context
import os

export_bp = Blueprint('export', __name__)

def get_db_path():
    return os.getenv('DATABASE_PATH', 'soundmeter.db')

@export_bp.route('/api/export', methods=['GET'])
def export_csv():
    """Export sound logs as CSV file"""
    from flask import request

    date_str = request.args.get('date')
    slots_str = request.args.get('slots', '1,2,3,4')

    if not date_str:
        return {"error": "Date parameter required"}, 400

    try:
        # Parse date
        date = datetime.strptime(date_str, '%Y-%m-%d').date()

        # Parse slots
        slot_ids = [int(s.strip()) for s in slots_str.split(',')]

        # Query database
        with get_db_context(get_db_path()) as conn:
            cursor = conn.cursor()

            placeholders = ','.join('?' * len(slot_ids))
            query = f'''
                SELECT
                    sl.timestamp,
                    sl.decibels,
                    ts.name as time_slot_name
                FROM sound_logs sl
                JOIN time_slots ts ON sl.time_slot_id = ts.id
                WHERE DATE(sl.timestamp) = ?
                AND sl.time_slot_id IN ({placeholders})
                ORDER BY sl.timestamp
            '''

            cursor.execute(query, [date.isoformat()] + slot_ids)
            rows = cursor.fetchall()

        # Generate CSV
        output = StringIO()
        writer = csv.writer(output)

        # Write header
        writer.writerow(['timestamp', 'decibels', 'time_slot_name'])

        # Write data
        for row in rows:
            writer.writerow([row['timestamp'], row['decibels'], row['time_slot_name']])

        # Create response
        output.seek(0)
        filename = f'soundmeter_{date_str}.csv'

        return Response(
            output.getvalue(),
            mimetype='text/csv',
            headers={
                'Content-Disposition': f'attachment; filename={filename}'
            }
        )

    except Exception as e:
        return {"error": str(e)}, 500
