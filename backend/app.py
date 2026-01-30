from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
import os

load_dotenv()

app = Flask(__name__, static_folder=None)
CORS(app)

# Register blueprints
from routes.config import config_bp
app.register_blueprint(config_bp)
from routes.logs import logs_bp
app.register_blueprint(logs_bp)
from routes.export import export_bp
app.register_blueprint(export_bp)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"}), 200

@app.route('/api/debug', methods=['GET'])
def debug_info():
    """Debug endpoint to help diagnose database and connectivity issues"""
    from database import get_db_context
    from datetime import datetime
    import pytz

    db_path = os.getenv('DATABASE_PATH', 'soundmeter.db')
    abs_db_path = os.path.abspath(db_path)
    tz = pytz.timezone(os.getenv('TIMEZONE', 'Europe/Paris'))

    debug_data = {
        "server_time": datetime.now(tz).isoformat(),
        "timezone": os.getenv('TIMEZONE', 'Europe/Paris'),
        "database": {
            "configured_path": db_path,
            "absolute_path": abs_db_path,
            "exists": os.path.exists(db_path),
            "size_bytes": os.path.getsize(db_path) if os.path.exists(db_path) else 0
        },
        "environment": {
            "FLASK_ENV": os.getenv('FLASK_ENV', 'not set'),
            "working_directory": os.getcwd()
        }
    }

    # Get database stats
    try:
        with get_db_context(db_path) as conn:
            cursor = conn.cursor()

            # Total logs
            cursor.execute('SELECT COUNT(*) as count FROM sound_logs')
            debug_data["logs"] = {"total_count": cursor.fetchone()['count']}

            # Logs by date (last 10 dates)
            cursor.execute('''
                SELECT DATE(timestamp) as date, COUNT(*) as count
                FROM sound_logs
                GROUP BY DATE(timestamp)
                ORDER BY date DESC
                LIMIT 10
            ''')
            debug_data["logs"]["by_date"] = [
                {"date": row['date'], "count": row['count']}
                for row in cursor.fetchall()
            ]

            # Logs by zone
            cursor.execute('''
                SELECT zone_id, COUNT(*) as count
                FROM sound_logs
                GROUP BY zone_id
                ORDER BY zone_id
            ''')
            debug_data["logs"]["by_zone"] = [
                {"zone_id": row['zone_id'], "count": row['count']}
                for row in cursor.fetchall()
            ]

            # Zone names
            cursor.execute('SELECT id, name FROM zones ORDER BY id')
            debug_data["zones"] = [
                {"id": row['id'], "name": row['name']}
                for row in cursor.fetchall()
            ]

    except Exception as e:
        debug_data["database_error"] = str(e)

    return jsonify(debug_data), 200

# Serve frontend - use absolute path for Docker compatibility
FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'build'))

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    if path and os.path.exists(os.path.join(FRONTEND_DIR, path)):
        return send_from_directory(FRONTEND_DIR, path)
    return send_from_directory(FRONTEND_DIR, 'index.html')

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
