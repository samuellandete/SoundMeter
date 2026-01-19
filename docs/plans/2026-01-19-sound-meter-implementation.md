# Sound Meter Web App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an iPad-optimized web app that monitors dining hall sound levels with real-time traffic light display, 30-second logging during lunch hours (11:30-13:30 CET), and comprehensive data visualization.

**Architecture:** Flask backend with SQLite database serves REST API and static React frontend. Web Audio API captures microphone input for real-time display (0.5-1s updates) and 30-second database logging. Chart.js provides four visualization types for time-slot comparison.

**Tech Stack:** Python 3.10+, Flask, SQLite3, pytz, React 18, Chart.js, TailwindCSS, Web Audio API

---

## Task 1: Backend Project Setup

**Files:**
- Create: `backend/app.py`
- Create: `backend/requirements.txt`
- Create: `backend/.env.example`
- Create: `backend/database.py`
- Create: `.gitignore`

**Step 1: Create backend directory structure**

```bash
mkdir -p backend
cd backend
```

**Step 2: Create requirements.txt**

Create `backend/requirements.txt`:

```txt
Flask==3.0.0
Flask-CORS==4.0.0
python-dotenv==1.0.0
pytz==2024.1
```

**Step 3: Create .env.example**

Create `backend/.env.example`:

```
FLASK_ENV=development
TIMEZONE=Europe/Paris
DATABASE_PATH=soundmeter.db
```

**Step 4: Create .gitignore**

Create `.gitignore` in project root:

```
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
env/
venv/
ENV/
.venv

# Database
*.db
*.sqlite
*.sqlite3

# Environment
.env

# Node
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Build
build/
dist/
*.egg-info/

# IDE
.vscode/
.idea/
*.swp
*.swo
.DS_Store

# Frontend
frontend/build/
frontend/.env.local
```

**Step 5: Create minimal Flask app**

Create `backend/app.py`:

```python
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os

load_dotenv()

app = Flask(__name__)
CORS(app)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"}), 200

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
```

**Step 6: Test Flask app runs**

Run:
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Test in browser: `http://localhost:5000/health`
Expected: `{"status": "ok"}`

**Step 7: Commit**

```bash
git add backend/ .gitignore
git commit -m "feat: setup Flask backend with CORS and health endpoint"
```

---

## Task 2: Database Schema Implementation

**Files:**
- Create: `backend/database.py`
- Create: `backend/init_db.py`
- Create: `backend/tests/test_database.py`

**Step 1: Write database connection test**

Create `backend/tests/test_database.py`:

```python
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
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd backend
pytest tests/test_database.py -v
```
Expected: FAIL with "ModuleNotFoundError: No module named 'database'"

**Step 3: Implement database.py**

Create `backend/database.py`:

```python
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
            'thresholds': json.dumps({'green_max': 60, 'yellow_max': 80, 'red_min': 80}),
            'visual_update_rate': '1000'
        }
        for key, value in default_config.items():
            cursor.execute('INSERT INTO config (key, value) VALUES (?, ?)', (key, value))

    conn.commit()
    close_db(conn)
```

**Step 4: Run test to verify it passes**

Run:
```bash
pytest tests/test_database.py -v
```
Expected: PASS

**Step 5: Create database initialization script**

Create `backend/init_db.py`:

```python
from database import init_db
import os
from dotenv import load_dotenv

load_dotenv()

if __name__ == '__main__':
    db_path = os.getenv('DATABASE_PATH', 'soundmeter.db')
    init_db(db_path)
    print(f"Database initialized at {db_path}")
```

**Step 6: Test initialization script**

Run:
```bash
python init_db.py
```
Expected: "Database initialized at soundmeter.db"

**Step 7: Commit**

```bash
git add backend/database.py backend/init_db.py backend/tests/
git commit -m "feat: implement database schema with time_slots, sound_logs, and config tables"
```

---

## Task 3: Backend API - Configuration Endpoints

**Files:**
- Create: `backend/routes/config.py`
- Modify: `backend/app.py`
- Create: `backend/tests/test_config_api.py`

**Step 1: Write test for GET /api/config**

Create `backend/tests/test_config_api.py`:

```python
import pytest
import json
import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from database import init_db

@pytest.fixture
def client():
    app.config['TESTING'] = True
    app.config['DATABASE_PATH'] = 'test_api.db'

    # Initialize test database
    init_db('test_api.db')

    with app.test_client() as client:
        yield client

    # Cleanup
    if os.path.exists('test_api.db'):
        os.remove('test_api.db')

def test_get_config(client):
    """Test GET /api/config returns configuration"""
    response = client.get('/api/config')
    assert response.status_code == 200

    data = json.loads(response.data)
    assert 'thresholds' in data
    assert 'visual_update_rate' in data
    assert 'time_slots' in data

    # Check default thresholds
    assert data['thresholds']['green_max'] == 60
    assert data['thresholds']['yellow_max'] == 80

    # Check time slots
    assert len(data['time_slots']) == 4
    assert data['time_slots'][0]['name'] == 'Period 1'
```

**Step 2: Run test to verify it fails**

Run:
```bash
pytest tests/test_config_api.py::test_get_config -v
```
Expected: FAIL with 404 Not Found

**Step 3: Implement config routes**

Create `backend/routes/config.py`:

```python
from flask import Blueprint, jsonify, request
import json
from database import get_db_context
import os

config_bp = Blueprint('config', __name__)

def get_db_path():
    return os.getenv('DATABASE_PATH', 'soundmeter.db')

@config_bp.route('/api/config', methods=['GET'])
def get_config():
    """Get current configuration"""
    with get_db_context(get_db_path()) as conn:
        cursor = conn.cursor()

        # Get thresholds and visual update rate
        cursor.execute('SELECT key, value FROM config')
        config_data = {}
        for row in cursor.fetchall():
            if row['key'] == 'thresholds':
                config_data['thresholds'] = json.loads(row['value'])
            elif row['key'] == 'visual_update_rate':
                config_data['visual_update_rate'] = int(row['value'])

        # Get time slots
        cursor.execute('SELECT id, start_time, end_time, name FROM time_slots ORDER BY id')
        time_slots = []
        for row in cursor.fetchall():
            time_slots.append({
                'id': row['id'],
                'start_time': row['start_time'],
                'end_time': row['end_time'],
                'name': row['name']
            })

        config_data['time_slots'] = time_slots

    return jsonify(config_data), 200

@config_bp.route('/api/config', methods=['POST'])
def update_config():
    """Update configuration"""
    data = request.get_json()

    if not data:
        return jsonify({"error": "No data provided"}), 400

    with get_db_context(get_db_path()) as conn:
        cursor = conn.cursor()

        # Update thresholds if provided
        if 'thresholds' in data:
            cursor.execute(
                'UPDATE config SET value = ? WHERE key = ?',
                (json.dumps(data['thresholds']), 'thresholds')
            )

        # Update visual update rate if provided
        if 'visual_update_rate' in data:
            cursor.execute(
                'UPDATE config SET value = ? WHERE key = ?',
                (str(data['visual_update_rate']), 'visual_update_rate')
            )

        # Update time slot names if provided
        if 'time_slots' in data:
            for slot in data['time_slots']:
                if 'id' in slot and 'name' in slot:
                    cursor.execute(
                        'UPDATE time_slots SET name = ? WHERE id = ?',
                        (slot['name'], slot['id'])
                    )

        conn.commit()

    # Return updated config
    return get_config()
```

**Step 4: Register blueprint in app.py**

Modify `backend/app.py`:

```python
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os

load_dotenv()

app = Flask(__name__)
CORS(app)

# Register blueprints
from routes.config import config_bp
app.register_blueprint(config_bp)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"}), 200

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
```

**Step 5: Create routes directory**

```bash
mkdir -p backend/routes
touch backend/routes/__init__.py
```

**Step 6: Run test to verify it passes**

Run:
```bash
pytest tests/test_config_api.py::test_get_config -v
```
Expected: PASS

**Step 7: Commit**

```bash
git add backend/routes/ backend/app.py backend/tests/test_config_api.py
git commit -m "feat: add GET and POST /api/config endpoints for configuration management"
```

---

## Task 4: Backend API - Logging Endpoints

**Files:**
- Create: `backend/routes/logs.py`
- Modify: `backend/app.py`
- Create: `backend/tests/test_logs_api.py`

**Step 1: Write test for POST /api/logs**

Create `backend/tests/test_logs_api.py`:

```python
import pytest
import json
import os
import sys
from datetime import datetime
import pytz
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from database import init_db

@pytest.fixture
def client():
    app.config['TESTING'] = True
    app.config['DATABASE_PATH'] = 'test_logs.db'

    init_db('test_logs.db')

    with app.test_client() as client:
        yield client

    if os.path.exists('test_logs.db'):
        os.remove('test_logs.db')

def test_post_log_within_hours(client):
    """Test POST /api/logs accepts logs during lunch hours"""
    # Create a timestamp within lunch hours (CET)
    cet = pytz.timezone('Europe/Paris')
    timestamp = cet.localize(datetime(2026, 1, 19, 11, 45, 0))

    response = client.post('/api/logs',
        json={
            'timestamp': timestamp.isoformat(),
            'decibels': 65.5
        })

    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['success'] == True

def test_post_log_outside_hours(client):
    """Test POST /api/logs rejects logs outside lunch hours"""
    cet = pytz.timezone('Europe/Paris')
    timestamp = cet.localize(datetime(2026, 1, 19, 10, 0, 0))

    response = client.post('/api/logs',
        json={
            'timestamp': timestamp.isoformat(),
            'decibels': 65.5
        })

    assert response.status_code == 400
    data = json.loads(response.data)
    assert data['success'] == False
    assert 'outside recording hours' in data['message'].lower()
```

**Step 2: Run test to verify it fails**

Run:
```bash
pytest tests/test_logs_api.py::test_post_log_within_hours -v
```
Expected: FAIL with 404 Not Found

**Step 3: Implement logs routes**

Create `backend/routes/logs.py`:

```python
from flask import Blueprint, jsonify, request
from datetime import datetime
import pytz
from database import get_db_context
import os

logs_bp = Blueprint('logs', __name__)

def get_db_path():
    return os.getenv('DATABASE_PATH', 'soundmeter.db')

def get_timezone():
    return pytz.timezone(os.getenv('TIMEZONE', 'Europe/Paris'))

def is_within_recording_hours(dt):
    """Check if datetime is within 11:30-13:30"""
    time = dt.time()
    start = datetime.strptime('11:30:00', '%H:%M:%S').time()
    end = datetime.strptime('13:30:00', '%H:%M:%S').time()
    return start <= time <= end

def get_time_slot_id(dt):
    """Determine which time slot (1-4) the datetime falls into"""
    time = dt.time()

    if datetime.strptime('11:30:00', '%H:%M:%S').time() <= time < datetime.strptime('12:00:00', '%H:%M:%S').time():
        return 1
    elif datetime.strptime('12:00:00', '%H:%M:%S').time() <= time < datetime.strptime('12:30:00', '%H:%M:%S').time():
        return 2
    elif datetime.strptime('12:30:00', '%H:%M:%S').time() <= time < datetime.strptime('13:00:00', '%H:%M:%S').time():
        return 3
    elif datetime.strptime('13:00:00', '%H:%M:%S').time() <= time <= datetime.strptime('13:30:00', '%H:%M:%S').time():
        return 4
    return None

@logs_bp.route('/api/logs', methods=['POST'])
def create_log():
    """Create a new sound log entry"""
    data = request.get_json()

    if not data or 'timestamp' not in data or 'decibels' not in data:
        return jsonify({"success": False, "message": "Missing required fields"}), 400

    try:
        # Parse timestamp
        timestamp_str = data['timestamp']
        timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))

        # Convert to CET
        cet = get_timezone()
        if timestamp.tzinfo is None:
            timestamp = cet.localize(timestamp)
        else:
            timestamp = timestamp.astimezone(cet)

        # Validate recording hours
        if not is_within_recording_hours(timestamp):
            return jsonify({
                "success": False,
                "message": "Timestamp outside recording hours (11:30-13:30 CET)"
            }), 400

        # Validate decibels range
        decibels = float(data['decibels'])
        if not 0 <= decibels <= 120:
            return jsonify({
                "success": False,
                "message": "Decibels must be between 0 and 120"
            }), 400

        # Get time slot
        time_slot_id = get_time_slot_id(timestamp)
        if time_slot_id is None:
            return jsonify({
                "success": False,
                "message": "Could not determine time slot"
            }), 400

        # Save to database
        with get_db_context(get_db_path()) as conn:
            cursor = conn.cursor()
            cursor.execute(
                'INSERT INTO sound_logs (timestamp, decibels, time_slot_id) VALUES (?, ?, ?)',
                (timestamp.isoformat(), decibels, time_slot_id)
            )
            conn.commit()

        return jsonify({"success": True, "message": "Log saved"}), 200

    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@logs_bp.route('/api/logs', methods=['GET'])
def get_logs():
    """Get sound logs filtered by date and time slots"""
    date_str = request.args.get('date')
    slots_str = request.args.get('slots', '1,2,3,4')

    if not date_str:
        return jsonify({"error": "Date parameter required"}), 400

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
                    sl.id,
                    sl.timestamp,
                    sl.decibels,
                    sl.time_slot_id,
                    ts.name as slot_name
                FROM sound_logs sl
                JOIN time_slots ts ON sl.time_slot_id = ts.id
                WHERE DATE(sl.timestamp) = ?
                AND sl.time_slot_id IN ({placeholders})
                ORDER BY sl.timestamp
            '''

            cursor.execute(query, [date.isoformat()] + slot_ids)

            logs = []
            for row in cursor.fetchall():
                logs.append({
                    'id': row['id'],
                    'timestamp': row['timestamp'],
                    'decibels': row['decibels'],
                    'time_slot_id': row['time_slot_id'],
                    'slot_name': row['slot_name']
                })

        return jsonify(logs), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500
```

**Step 4: Register blueprint in app.py**

Modify `backend/app.py` to add:

```python
from routes.logs import logs_bp
app.register_blueprint(logs_bp)
```

**Step 5: Run tests to verify they pass**

Run:
```bash
pytest tests/test_logs_api.py -v
```
Expected: PASS on both tests

**Step 6: Commit**

```bash
git add backend/routes/logs.py backend/app.py backend/tests/test_logs_api.py
git commit -m "feat: add POST and GET /api/logs endpoints with CET timezone validation"
```

---

## Task 5: Backend API - CSV Export Endpoint

**Files:**
- Create: `backend/routes/export.py`
- Modify: `backend/app.py`
- Create: `backend/tests/test_export_api.py`

**Step 1: Write test for GET /api/export**

Create `backend/tests/test_export_api.py`:

```python
import pytest
import os
import sys
from datetime import datetime
import pytz
import csv
from io import StringIO
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from database import init_db, get_db_context

@pytest.fixture
def client():
    app.config['TESTING'] = True
    app.config['DATABASE_PATH'] = 'test_export.db'

    init_db('test_export.db')

    # Insert test data
    cet = pytz.timezone('Europe/Paris')
    with get_db_context('test_export.db') as conn:
        cursor = conn.cursor()
        test_logs = [
            (cet.localize(datetime(2026, 1, 19, 11, 45, 0)).isoformat(), 65.5, 1),
            (cet.localize(datetime(2026, 1, 19, 12, 15, 0)).isoformat(), 72.3, 2),
        ]
        cursor.executemany(
            'INSERT INTO sound_logs (timestamp, decibels, time_slot_id) VALUES (?, ?, ?)',
            test_logs
        )
        conn.commit()

    with app.test_client() as client:
        yield client

    if os.path.exists('test_export.db'):
        os.remove('test_export.db')

def test_export_csv(client):
    """Test GET /api/export returns CSV file"""
    response = client.get('/api/export?date=2026-01-19&slots=1,2')

    assert response.status_code == 200
    assert response.headers['Content-Type'] == 'text/csv; charset=utf-8'
    assert 'attachment' in response.headers['Content-Disposition']

    # Parse CSV content
    csv_content = response.data.decode('utf-8')
    csv_reader = csv.DictReader(StringIO(csv_content))
    rows = list(csv_reader)

    assert len(rows) == 2
    assert 'timestamp' in rows[0]
    assert 'decibels' in rows[0]
    assert 'time_slot_name' in rows[0]
```

**Step 2: Run test to verify it fails**

Run:
```bash
pytest tests/test_export_api.py::test_export_csv -v
```
Expected: FAIL with 404 Not Found

**Step 3: Implement export route**

Create `backend/routes/export.py`:

```python
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
```

**Step 4: Register blueprint in app.py**

Modify `backend/app.py` to add:

```python
from routes.export import export_bp
app.register_blueprint(export_bp)
```

**Step 5: Run test to verify it passes**

Run:
```bash
pytest tests/test_export_api.py::test_export_csv -v
```
Expected: PASS

**Step 6: Commit**

```bash
git add backend/routes/export.py backend/app.py backend/tests/test_export_api.py
git commit -m "feat: add GET /api/export endpoint for CSV download"
```

---

## Task 6: Frontend Project Setup

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/public/index.html`
- Create: `frontend/src/index.js`
- Create: `frontend/src/App.js`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/src/index.css`

**Step 1: Create React app structure**

```bash
mkdir -p frontend/src frontend/public
```

**Step 2: Create package.json**

Create `frontend/package.json`:

```json
{
  "name": "soundmeter-frontend",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "chart.js": "^4.4.0",
    "react-chartjs-2": "^5.2.0",
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "react-scripts": "5.0.1",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.32"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test",
    "eject": "react-scripts eject"
  },
  "eslintConfig": {
    "extends": [
      "react-app"
    ]
  },
  "browserslist": {
    "production": [
      ">0.2%",
      "not dead",
      "not op_mini all"
    ],
    "development": [
      "last 1 chrome version",
      "last 1 firefox version",
      "last 1 safari version"
    ]
  }
}
```

**Step 3: Create index.html**

Create `frontend/public/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <meta name="theme-color" content="#000000" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <title>Sound Meter</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>
```

**Step 4: Setup Tailwind CSS**

Create `frontend/tailwind.config.js`:

```js
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'traffic-green': '#22c55e',
        'traffic-yellow': '#eab308',
        'traffic-red': '#ef4444',
      },
    },
  },
  plugins: [],
}
```

Create `frontend/src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Prevent text selection and scrolling on iPad */
* {
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}

input, textarea {
  -webkit-user-select: text;
  user-select: text;
}

/* Large touch targets for iPad */
button, a, input[type="checkbox"], input[type="radio"] {
  min-width: 44px;
  min-height: 44px;
}
```

**Step 5: Create index.js**

Create `frontend/src/index.js`:

```js
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

**Step 6: Create minimal App.js**

Create `frontend/src/App.js`:

```js
import React from 'react';

function App() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <h1 className="text-4xl font-bold text-gray-800">Sound Meter</h1>
    </div>
  );
}

export default App;
```

**Step 7: Create postcss config**

Create `frontend/postcss.config.js`:

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

**Step 8: Install dependencies and test**

Run:
```bash
cd frontend
npm install
npm start
```

Expected: Browser opens to `http://localhost:3000` showing "Sound Meter"

**Step 9: Commit**

```bash
git add frontend/
git commit -m "feat: setup React frontend with Tailwind CSS and iPad optimization"
```

---

## Task 7: Audio Processing Module

**Files:**
- Create: `frontend/src/utils/audioProcessor.js`
- Create: `frontend/src/hooks/useAudioLevel.js`

**Step 1: Create audio processor utility**

Create `frontend/src/utils/audioProcessor.js`:

```js
class AudioProcessor {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.microphone = null;
    this.dataArray = null;
    this.isActive = false;
  }

  async initialize() {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      // Create audio context
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;

      // Connect microphone to analyser
      this.microphone = this.audioContext.createMediaStreamSource(stream);
      this.microphone.connect(this.analyser);

      // Setup data array for frequency data
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);

      this.isActive = true;
      return { success: true };
    } catch (error) {
      console.error('Error initializing audio:', error);
      return { success: false, error: error.message };
    }
  }

  getDecibels() {
    if (!this.isActive || !this.analyser) {
      return 0;
    }

    // Get frequency data
    this.analyser.getByteFrequencyData(this.dataArray);

    // Calculate RMS (Root Mean Square)
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const normalized = this.dataArray[i] / 255.0;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / this.dataArray.length);

    // Convert to decibels (0-100 range)
    // Using a logarithmic scale with reference
    const db = 20 * Math.log10(rms + 0.001) + 100;

    // Clamp between 0 and 120
    return Math.max(0, Math.min(120, db));
  }

  stop() {
    if (this.microphone) {
      this.microphone.disconnect();
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
    this.isActive = false;
  }
}

export default AudioProcessor;
```

**Step 2: Create React hook for audio level**

Create `frontend/src/hooks/useAudioLevel.js`:

```js
import { useState, useEffect, useRef } from 'react';
import AudioProcessor from '../utils/audioProcessor';

export const useAudioLevel = (updateInterval = 1000) => {
  const [decibels, setDecibels] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState(null);
  const audioProcessorRef = useRef(null);
  const intervalRef = useRef(null);

  const initialize = async () => {
    const processor = new AudioProcessor();
    const result = await processor.initialize();

    if (result.success) {
      audioProcessorRef.current = processor;
      setIsInitialized(true);
      setError(null);
    } else {
      setError(result.error);
    }
  };

  const stop = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    if (audioProcessorRef.current) {
      audioProcessorRef.current.stop();
    }
    setIsInitialized(false);
  };

  useEffect(() => {
    if (isInitialized && audioProcessorRef.current) {
      // Update decibels at specified interval
      intervalRef.current = setInterval(() => {
        const db = audioProcessorRef.current.getDecibels();
        setDecibels(db);
      }, updateInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isInitialized, updateInterval]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, []);

  return {
    decibels,
    isInitialized,
    error,
    initialize,
    stop
  };
};
```

**Step 3: Test audio processing in App.js**

Modify `frontend/src/App.js`:

```js
import React, { useEffect } from 'react';
import { useAudioLevel } from './hooks/useAudioLevel';

function App() {
  const { decibels, isInitialized, error, initialize } = useAudioLevel(1000);

  useEffect(() => {
    // Auto-initialize on mount
    initialize();
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-8">Sound Meter</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          Error: {error}
        </div>
      )}

      {!isInitialized && !error && (
        <button
          onClick={initialize}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Start Monitoring
        </button>
      )}

      {isInitialized && (
        <div className="text-6xl font-bold text-gray-800">
          {decibels.toFixed(1)} dB
        </div>
      )}
    </div>
  );
}

export default App;
```

**Step 4: Test in browser**

Run:
```bash
npm start
```

Expected: Page shows "Start Monitoring" button, clicking it requests microphone access, then displays decibel readings

**Step 5: Commit**

```bash
git add frontend/src/utils/ frontend/src/hooks/ frontend/src/App.js
git commit -m "feat: implement audio processing with Web Audio API and real-time decibel measurement"
```

---

## Task 8: Traffic Light Display Component

**Files:**
- Create: `frontend/src/components/TrafficLight.js`
- Create: `frontend/src/components/SoundMeter.js`
- Modify: `frontend/src/App.js`

**Step 1: Create TrafficLight component**

Create `frontend/src/components/TrafficLight.js`:

```js
import React from 'react';

const TrafficLight = ({ decibels, thresholds }) => {
  const { green_max, yellow_max } = thresholds;

  const getColor = () => {
    if (decibels <= green_max) return 'traffic-green';
    if (decibels <= yellow_max) return 'traffic-yellow';
    return 'traffic-red';
  };

  const getColorClass = () => {
    const color = getColor();
    return `bg-${color}`;
  };

  const getTextColor = () => {
    const color = getColor();
    return `text-${color}`;
  };

  return (
    <div className="flex flex-col items-center">
      {/* Traffic Light Circle */}
      <div
        className={`w-64 h-64 rounded-full ${getColorClass()} shadow-2xl flex items-center justify-center transition-colors duration-300`}
      >
        <span className="text-white text-7xl font-bold">
          {decibels.toFixed(0)}
        </span>
      </div>

      {/* Decibel Label */}
      <div className={`mt-6 text-4xl font-bold ${getTextColor()}`}>
        dB
      </div>

      {/* Status Text */}
      <div className="mt-4 text-xl text-gray-600">
        {decibels <= green_max && 'Quiet'}
        {decibels > green_max && decibels <= yellow_max && 'Moderate'}
        {decibels > yellow_max && 'Too Loud'}
      </div>
    </div>
  );
};

export default TrafficLight;
```

**Step 2: Create SoundMeter component**

Create `frontend/src/components/SoundMeter.js`:

```js
import React, { useState, useEffect } from 'react';
import { useAudioLevel } from '../hooks/useAudioLevel';
import TrafficLight from './TrafficLight';

const SoundMeter = ({ config, onLogSave }) => {
  const { visual_update_rate, thresholds } = config;
  const { decibels, isInitialized, error, initialize } = useAudioLevel(visual_update_rate);
  const [isRecording, setIsRecording] = useState(false);
  const [nextLogIn, setNextLogIn] = useState(30);

  // Check if within recording hours (11:30-13:30 CET)
  const isWithinRecordingHours = () => {
    const now = new Date();
    const cet = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Paris',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(now);

    const [hours, minutes] = cet.split(':').map(Number);
    const timeInMinutes = hours * 60 + minutes;
    const startTime = 11 * 60 + 30; // 11:30
    const endTime = 13 * 60 + 30;   // 13:30

    return timeInMinutes >= startTime && timeInMinutes <= endTime;
  };

  // Update recording status every second
  useEffect(() => {
    const checkRecording = () => {
      setIsRecording(isWithinRecordingHours());
    };

    checkRecording();
    const interval = setInterval(checkRecording, 1000);

    return () => clearInterval(interval);
  }, []);

  // Log countdown timer
  useEffect(() => {
    if (!isRecording) return;

    const countdown = setInterval(() => {
      setNextLogIn(prev => {
        if (prev <= 1) {
          // Save log
          if (onLogSave && isInitialized) {
            onLogSave(decibels);
          }
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdown);
  }, [isRecording, isInitialized, decibels, onLogSave]);

  return (
    <div className="flex flex-col items-center">
      {/* Recording Status */}
      <div className="mb-8 flex items-center gap-3">
        <div className={`w-4 h-4 rounded-full ${isRecording ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
        <span className="text-lg font-semibold text-gray-700">
          {isRecording ? 'Recording' : 'Stopped'}
        </span>
        {isRecording && (
          <span className="text-sm text-gray-500">
            Next log in {nextLogIn}s
          </span>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg max-w-md">
          <p className="font-bold">Microphone Error</p>
          <p className="text-sm mt-1">{error}</p>
          <p className="text-xs mt-2">Please enable microphone access in Safari settings</p>
        </div>
      )}

      {/* Start Button */}
      {!isInitialized && !error && (
        <button
          onClick={initialize}
          className="mb-8 bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 px-8 rounded-lg text-xl shadow-lg transition-colors"
        >
          Start Monitoring
        </button>
      )}

      {/* Traffic Light Display */}
      {isInitialized && (
        <TrafficLight decibels={decibels} thresholds={thresholds} />
      )}
    </div>
  );
};

export default SoundMeter;
```

**Step 3: Update App.js to use SoundMeter**

Modify `frontend/src/App.js`:

```js
import React, { useState, useEffect } from 'react';
import SoundMeter from './components/SoundMeter';

function App() {
  const [config, setConfig] = useState({
    thresholds: { green_max: 60, yellow_max: 80, red_min: 80 },
    visual_update_rate: 1000,
    time_slots: []
  });

  const handleLogSave = (decibels) => {
    console.log('Save log:', decibels, 'dB');
    // TODO: Send to backend
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-5xl font-bold text-gray-800 text-center mb-12">
          Sound Meter
        </h1>

        <SoundMeter config={config} onLogSave={handleLogSave} />
      </div>
    </div>
  );
}

export default App;
```

**Step 4: Test traffic light display**

Run:
```bash
npm start
```

Expected: Traffic light changes color based on sound level (green/yellow/red)

**Step 5: Commit**

```bash
git add frontend/src/components/ frontend/src/App.js
git commit -m "feat: add traffic light display with real-time color changes and recording status"
```

---

## Task 9: API Integration and Logging

**Files:**
- Create: `frontend/src/services/api.js`
- Modify: `frontend/src/App.js`
- Modify: `frontend/src/components/SoundMeter.js`

**Step 1: Create API service**

Create `frontend/src/services/api.js`:

```js
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const apiService = {
  // Get configuration
  getConfig: async () => {
    try {
      const response = await api.get('/api/config');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Update configuration
  updateConfig: async (config) => {
    try {
      const response = await api.post('/api/config', config);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Save sound log
  saveLog: async (decibels) => {
    try {
      const timestamp = new Date().toISOString();
      const response = await api.post('/api/logs', {
        timestamp,
        decibels
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get logs
  getLogs: async (date, slots = [1, 2, 3, 4]) => {
    try {
      const slotsParam = slots.join(',');
      const response = await api.get(`/api/logs?date=${date}&slots=${slotsParam}`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Export CSV
  exportCSV: async (date, slots = [1, 2, 3, 4]) => {
    try {
      const slotsParam = slots.join(',');
      const response = await api.get(`/api/export?date=${date}&slots=${slotsParam}`, {
        responseType: 'blob'
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `soundmeter_${date}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
```

**Step 2: Update App.js to fetch config and save logs**

Modify `frontend/src/App.js`:

```js
import React, { useState, useEffect } from 'react';
import SoundMeter from './components/SoundMeter';
import { apiService } from './services/api';

function App() {
  const [config, setConfig] = useState({
    thresholds: { green_max: 60, yellow_max: 80, red_min: 80 },
    visual_update_rate: 1000,
    time_slots: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load configuration on mount
  useEffect(() => {
    const loadConfig = async () => {
      const result = await apiService.getConfig();
      if (result.success) {
        setConfig(result.data);
      } else {
        setError('Failed to load configuration');
        console.error(result.error);
      }
      setLoading(false);
    };

    loadConfig();
  }, []);

  const handleLogSave = async (decibels) => {
    const result = await apiService.saveLog(decibels);
    if (!result.success) {
      console.error('Failed to save log:', result.error);
      // TODO: Queue for retry
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex items-center justify-center">
        <div className="text-2xl text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-5xl font-bold text-gray-800 text-center mb-12">
          Sound Meter
        </h1>

        {error && (
          <div className="max-w-md mx-auto mb-8 bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg">
            {error}
          </div>
        )}

        <SoundMeter config={config} onLogSave={handleLogSave} />
      </div>
    </div>
  );
}

export default App;
```

**Step 3: Add .env file for API URL**

Create `frontend/.env`:

```
REACT_APP_API_URL=http://localhost:5000
```

**Step 4: Test API integration**

Run backend:
```bash
cd backend
source venv/bin/activate
python app.py
```

Run frontend (separate terminal):
```bash
cd frontend
npm start
```

Expected: App loads config from backend, saves logs every 30 seconds during recording hours

**Step 5: Commit**

```bash
git add frontend/src/services/ frontend/src/App.js frontend/.env
git commit -m "feat: integrate API service for config loading and log saving"
```

---

## Task 10: Configuration Panel Component

**Files:**
- Create: `frontend/src/components/ConfigPanel.js`
- Modify: `frontend/src/App.js`

**Step 1: Create ConfigPanel component**

Create `frontend/src/components/ConfigPanel.js`:

```js
import React, { useState } from 'react';
import { apiService } from '../services/api';

const ConfigPanel = ({ config, onConfigUpdate }) => {
  const [localConfig, setLocalConfig] = useState(config);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const handleThresholdChange = (key, value) => {
    setLocalConfig(prev => ({
      ...prev,
      thresholds: {
        ...prev.thresholds,
        [key]: parseInt(value)
      }
    }));
  };

  const handleSlotNameChange = (slotId, name) => {
    setLocalConfig(prev => ({
      ...prev,
      time_slots: prev.time_slots.map(slot =>
        slot.id === slotId ? { ...slot, name } : slot
      )
    }));
  };

  const handleUpdateRateChange = (rate) => {
    setLocalConfig(prev => ({
      ...prev,
      visual_update_rate: parseInt(rate)
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage('');

    const result = await apiService.updateConfig(localConfig);

    if (result.success) {
      setSaveMessage('Configuration saved successfully!');
      onConfigUpdate(result.data);
    } else {
      setSaveMessage('Error saving configuration');
    }

    setIsSaving(false);
    setTimeout(() => setSaveMessage(''), 3000);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Configuration</h2>

      {/* Thresholds */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">Sound Thresholds (dB)</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">
              Green Maximum: {localConfig.thresholds.green_max} dB
            </label>
            <input
              type="range"
              min="30"
              max="80"
              value={localConfig.thresholds.green_max}
              onChange={(e) => handleThresholdChange('green_max', e.target.value)}
              className="w-full h-2 bg-traffic-green rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">
              Yellow Maximum: {localConfig.thresholds.yellow_max} dB
            </label>
            <input
              type="range"
              min="50"
              max="100"
              value={localConfig.thresholds.yellow_max}
              onChange={(e) => handleThresholdChange('yellow_max', e.target.value)}
              className="w-full h-2 bg-traffic-yellow rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Visual Update Rate */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">Visual Update Rate</h3>
        <select
          value={localConfig.visual_update_rate}
          onChange={(e) => handleUpdateRateChange(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="500">0.5 seconds (Fast)</option>
          <option value="1000">1 second (Standard)</option>
        </select>
      </div>

      {/* Time Slot Names */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">Time Slot Names</h3>
        <div className="space-y-3">
          {localConfig.time_slots.map(slot => (
            <div key={slot.id} className="flex items-center gap-3">
              <span className="text-sm text-gray-600 w-32">
                {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
              </span>
              <input
                type="text"
                value={slot.name}
                onChange={(e) => handleSlotNameChange(slot.id, e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={`Period ${slot.id}`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-lg transition-colors disabled:bg-gray-400"
        >
          {isSaving ? 'Saving...' : 'Save Configuration'}
        </button>

        {saveMessage && (
          <span className={`text-sm font-medium ${saveMessage.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
            {saveMessage}
          </span>
        )}
      </div>
    </div>
  );
};

export default ConfigPanel;
```

**Step 2: Add ConfigPanel to App.js with tab navigation**

Modify `frontend/src/App.js`:

```js
import React, { useState, useEffect } from 'react';
import SoundMeter from './components/SoundMeter';
import ConfigPanel from './components/ConfigPanel';
import { apiService } from './services/api';

function App() {
  const [config, setConfig] = useState({
    thresholds: { green_max: 60, yellow_max: 80, red_min: 80 },
    visual_update_rate: 1000,
    time_slots: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('monitor'); // monitor, config, logs

  useEffect(() => {
    const loadConfig = async () => {
      const result = await apiService.getConfig();
      if (result.success) {
        setConfig(result.data);
      } else {
        setError('Failed to load configuration');
        console.error(result.error);
      }
      setLoading(false);
    };

    loadConfig();
  }, []);

  const handleLogSave = async (decibels) => {
    const result = await apiService.saveLog(decibels);
    if (!result.success) {
      console.error('Failed to save log:', result.error);
    }
  };

  const handleConfigUpdate = (newConfig) => {
    setConfig(newConfig);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex items-center justify-center">
        <div className="text-2xl text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-5xl font-bold text-gray-800 text-center mb-8">
          Sound Meter
        </h1>

        {/* Tab Navigation */}
        <div className="flex justify-center mb-8 gap-4">
          <button
            onClick={() => setActiveTab('monitor')}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
              activeTab === 'monitor'
                ? 'bg-blue-500 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            Monitor
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
              activeTab === 'config'
                ? 'bg-blue-500 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            Configuration
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
              activeTab === 'logs'
                ? 'bg-blue-500 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            Logs
          </button>
        </div>

        {error && (
          <div className="max-w-md mx-auto mb-8 bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg">
            {error}
          </div>
        )}

        {/* Tab Content */}
        <div className="flex justify-center">
          {activeTab === 'monitor' && (
            <SoundMeter config={config} onLogSave={handleLogSave} />
          )}
          {activeTab === 'config' && (
            <ConfigPanel config={config} onConfigUpdate={handleConfigUpdate} />
          )}
          {activeTab === 'logs' && (
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold text-gray-800">Logs Viewer</h2>
              <p className="text-gray-600 mt-4">Coming soon...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
```

**Step 3: Test configuration panel**

Run:
```bash
npm start
```

Expected: Can navigate to Configuration tab, adjust thresholds and time slot names, save successfully

**Step 4: Commit**

```bash
git add frontend/src/components/ConfigPanel.js frontend/src/App.js
git commit -m "feat: add configuration panel with threshold sliders and time slot naming"
```

---

## Task 11: Logs Viewer Component with Charts

**Files:**
- Create: `frontend/src/components/LogsViewer.js`
- Create: `frontend/src/components/charts/LineOverlay.js`
- Create: `frontend/src/components/charts/AverageBar.js`
- Create: `frontend/src/components/charts/PeakComparison.js`
- Create: `frontend/src/components/charts/ZonePercentage.js`
- Modify: `frontend/src/App.js`

**Step 1: Setup Chart.js in index.js**

Modify `frontend/src/index.js`:

```js
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

**Step 2: Create Line Overlay Chart**

Create `frontend/src/components/charts/LineOverlay.js`:

```js
import React from 'react';
import { Line } from 'react-chartjs-2';

const LineOverlay = ({ logsData, thresholds }) => {
  // Group logs by time slot
  const groupedLogs = {};
  logsData.forEach(log => {
    if (!groupedLogs[log.time_slot_id]) {
      groupedLogs[log.time_slot_id] = {
        name: log.slot_name,
        data: []
      };
    }

    // Calculate minutes from slot start
    const timestamp = new Date(log.timestamp);
    const minutes = timestamp.getMinutes();
    const seconds = timestamp.getSeconds();
    const totalMinutes = minutes % 30 + seconds / 60;

    groupedLogs[log.time_slot_id].data.push({
      x: totalMinutes,
      y: log.decibels
    });
  });

  // Generate datasets
  const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b'];
  const datasets = Object.entries(groupedLogs).map(([slotId, slot], index) => ({
    label: slot.name,
    data: slot.data.sort((a, b) => a.x - b.x),
    borderColor: colors[index % colors.length],
    backgroundColor: colors[index % colors.length] + '20',
    tension: 0.3,
  }));

  const data = {
    datasets
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'linear',
        min: 0,
        max: 30,
        title: {
          display: true,
          text: 'Minutes into period'
        }
      },
      y: {
        min: 0,
        max: 100,
        title: {
          display: true,
          text: 'Decibels (dB)'
        }
      }
    },
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Sound Levels Over Time',
        font: {
          size: 18
        }
      },
      annotation: {
        annotations: {
          greenLine: {
            type: 'line',
            yMin: thresholds.green_max,
            yMax: thresholds.green_max,
            borderColor: '#22c55e',
            borderWidth: 2,
            borderDash: [5, 5],
          },
          yellowLine: {
            type: 'line',
            yMin: thresholds.yellow_max,
            yMax: thresholds.yellow_max,
            borderColor: '#eab308',
            borderWidth: 2,
            borderDash: [5, 5],
          }
        }
      }
    }
  };

  return (
    <div style={{ height: '400px' }}>
      <Line data={data} options={options} />
    </div>
  );
};

export default LineOverlay;
```

**Step 3: Create Average Bar Chart**

Create `frontend/src/components/charts/AverageBar.js`:

```js
import React from 'react';
import { Bar } from 'react-chartjs-2';

const AverageBar = ({ logsData, thresholds }) => {
  // Calculate averages by time slot
  const slotAverages = {};
  logsData.forEach(log => {
    if (!slotAverages[log.time_slot_id]) {
      slotAverages[log.time_slot_id] = {
        name: log.slot_name,
        total: 0,
        count: 0
      };
    }
    slotAverages[log.time_slot_id].total += log.decibels;
    slotAverages[log.time_slot_id].count += 1;
  });

  const labels = [];
  const averages = [];
  const colors = [];

  Object.values(slotAverages).forEach(slot => {
    const avg = slot.total / slot.count;
    labels.push(slot.name);
    averages.push(avg);

    // Color based on threshold
    if (avg <= thresholds.green_max) {
      colors.push('#22c55e');
    } else if (avg <= thresholds.yellow_max) {
      colors.push('#eab308');
    } else {
      colors.push('#ef4444');
    }
  });

  const data = {
    labels,
    datasets: [{
      label: 'Average Decibels',
      data: averages,
      backgroundColor: colors,
    }]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        min: 0,
        max: 100,
        title: {
          display: true,
          text: 'Decibels (dB)'
        }
      }
    },
    plugins: {
      legend: {
        display: false
      },
      title: {
        display: true,
        text: 'Average Sound Level by Period',
        font: {
          size: 18
        }
      }
    }
  };

  return (
    <div style={{ height: '400px' }}>
      <Bar data={data} options={options} />
    </div>
  );
};

export default AverageBar;
```

**Step 4: Create Peak Comparison Chart**

Create `frontend/src/components/charts/PeakComparison.js`:

```js
import React from 'react';
import { Bar } from 'react-chartjs-2';

const PeakComparison = ({ logsData, thresholds }) => {
  // Find peak by time slot
  const slotPeaks = {};
  logsData.forEach(log => {
    if (!slotPeaks[log.time_slot_id] || log.decibels > slotPeaks[log.time_slot_id].peak) {
      slotPeaks[log.time_slot_id] = {
        name: log.slot_name,
        peak: log.decibels,
        timestamp: log.timestamp
      };
    }
  });

  const labels = [];
  const peaks = [];
  const colors = [];

  Object.values(slotPeaks).forEach(slot => {
    labels.push(slot.name);
    peaks.push(slot.peak);

    if (slot.peak <= thresholds.green_max) {
      colors.push('#22c55e');
    } else if (slot.peak <= thresholds.yellow_max) {
      colors.push('#eab308');
    } else {
      colors.push('#ef4444');
    }
  });

  const data = {
    labels,
    datasets: [{
      label: 'Peak Decibels',
      data: peaks,
      backgroundColor: colors,
    }]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        min: 0,
        max: 100,
        title: {
          display: true,
          text: 'Decibels (dB)'
        }
      }
    },
    plugins: {
      legend: {
        display: false
      },
      title: {
        display: true,
        text: 'Peak Noise Level by Period',
        font: {
          size: 18
        }
      },
      tooltip: {
        callbacks: {
          afterLabel: (context) => {
            const slotData = Object.values(slotPeaks)[context.dataIndex];
            return `Time: ${new Date(slotData.timestamp).toLocaleTimeString()}`;
          }
        }
      }
    }
  };

  return (
    <div style={{ height: '400px' }}>
      <Bar data={data} options={options} />
    </div>
  );
};

export default PeakComparison;
```

**Step 5: Create Zone Percentage Chart**

Create `frontend/src/components/charts/ZonePercentage.js`:

```js
import React from 'react';
import { Bar } from 'react-chartjs-2';

const ZonePercentage = ({ logsData, thresholds }) => {
  // Calculate zone percentages by time slot
  const slotZones = {};
  logsData.forEach(log => {
    if (!slotZones[log.time_slot_id]) {
      slotZones[log.time_slot_id] = {
        name: log.slot_name,
        green: 0,
        yellow: 0,
        red: 0,
        total: 0
      };
    }

    const slot = slotZones[log.time_slot_id];
    slot.total += 1;

    if (log.decibels <= thresholds.green_max) {
      slot.green += 1;
    } else if (log.decibels <= thresholds.yellow_max) {
      slot.yellow += 1;
    } else {
      slot.red += 1;
    }
  });

  const labels = [];
  const greenPercentages = [];
  const yellowPercentages = [];
  const redPercentages = [];

  Object.values(slotZones).forEach(slot => {
    labels.push(slot.name);
    greenPercentages.push((slot.green / slot.total * 100).toFixed(1));
    yellowPercentages.push((slot.yellow / slot.total * 100).toFixed(1));
    redPercentages.push((slot.red / slot.total * 100).toFixed(1));
  });

  const data = {
    labels,
    datasets: [
      {
        label: 'Quiet (Green)',
        data: greenPercentages,
        backgroundColor: '#22c55e',
      },
      {
        label: 'Moderate (Yellow)',
        data: yellowPercentages,
        backgroundColor: '#eab308',
      },
      {
        label: 'Too Loud (Red)',
        data: redPercentages,
        backgroundColor: '#ef4444',
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        stacked: true,
      },
      y: {
        stacked: true,
        min: 0,
        max: 100,
        title: {
          display: true,
          text: 'Percentage (%)'
        }
      }
    },
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Time in Each Zone by Period',
        font: {
          size: 18
        }
      }
    }
  };

  return (
    <div style={{ height: '400px' }}>
      <Bar data={data} options={options} />
    </div>
  );
};

export default ZonePercentage;
```

**Step 6: Create LogsViewer component**

Create `frontend/src/components/LogsViewer.js`:

```js
import React, { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import LineOverlay from './charts/LineOverlay';
import AverageBar from './charts/AverageBar';
import PeakComparison from './charts/PeakComparison';
import ZonePercentage from './charts/ZonePercentage';

const LogsViewer = ({ config }) => {
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [selectedSlots, setSelectedSlots] = useState([1, 2, 3, 4]);
  const [logsData, setLogsData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeChart, setActiveChart] = useState('overlay'); // overlay, average, peak, zones

  useEffect(() => {
    loadLogs();
  }, [selectedDate, selectedSlots]);

  const loadLogs = async () => {
    setLoading(true);
    const result = await apiService.getLogs(selectedDate, selectedSlots);
    if (result.success) {
      setLogsData(result.data);
    }
    setLoading(false);
  };

  const handleSlotToggle = (slotId) => {
    setSelectedSlots(prev =>
      prev.includes(slotId)
        ? prev.filter(id => id !== slotId)
        : [...prev, slotId]
    );
  };

  const handleExport = async () => {
    await apiService.exportCSV(selectedDate, selectedSlots);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-6xl w-full">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Logs Viewer</h2>

      {/* Date and Slot Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Date Picker */}
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">
            Select Date
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Time Slot Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">
            Select Time Periods
          </label>
          <div className="space-y-2">
            {config.time_slots.map(slot => (
              <label key={slot.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedSlots.includes(slot.id)}
                  onChange={() => handleSlotToggle(slot.id)}
                  className="w-5 h-5 text-blue-500 rounded"
                />
                <span className="text-sm text-gray-700">
                  {slot.name} ({slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)})
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Export Button */}
      <div className="mb-6">
        <button
          onClick={handleExport}
          className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-lg transition-colors"
        >
          Export to CSV
        </button>
      </div>

      {/* Chart Type Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        <button
          onClick={() => setActiveChart('overlay')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap ${
            activeChart === 'overlay'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Line Overlay
        </button>
        <button
          onClick={() => setActiveChart('average')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap ${
            activeChart === 'average'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Average Comparison
        </button>
        <button
          onClick={() => setActiveChart('peak')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap ${
            activeChart === 'peak'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Peak Noise
        </button>
        <button
          onClick={() => setActiveChart('zones')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap ${
            activeChart === 'zones'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Zone Percentages
        </button>
      </div>

      {/* Chart Display */}
      <div className="bg-gray-50 rounded-lg p-4">
        {loading ? (
          <div className="text-center py-20 text-gray-600">Loading data...</div>
        ) : logsData.length === 0 ? (
          <div className="text-center py-20 text-gray-600">
            No data available for selected date and time periods
          </div>
        ) : (
          <>
            {activeChart === 'overlay' && (
              <LineOverlay logsData={logsData} thresholds={config.thresholds} />
            )}
            {activeChart === 'average' && (
              <AverageBar logsData={logsData} thresholds={config.thresholds} />
            )}
            {activeChart === 'peak' && (
              <PeakComparison logsData={logsData} thresholds={config.thresholds} />
            )}
            {activeChart === 'zones' && (
              <ZonePercentage logsData={logsData} thresholds={config.thresholds} />
            )}
          </>
        )}
      </div>

      {/* Data Summary */}
      {logsData.length > 0 && (
        <div className="mt-6 bg-blue-50 rounded-lg p-4">
          <p className="text-sm text-gray-700">
            <strong>{logsData.length}</strong> log entries for{' '}
            <strong>{selectedSlots.length}</strong> time period(s)
          </p>
        </div>
      )}
    </div>
  );
};

export default LogsViewer;
```

**Step 7: Update App.js to use LogsViewer**

Modify `frontend/src/App.js` to replace the placeholder in logs tab:

```js
{activeTab === 'logs' && (
  <LogsViewer config={config} />
)}
```

**Step 8: Test all charts**

Run:
```bash
npm start
```

Expected: Can view logs with date/slot filters, switch between 4 chart types, export CSV

**Step 9: Commit**

```bash
git add frontend/src/components/LogsViewer.js frontend/src/components/charts/ frontend/src/App.js frontend/src/index.js
git commit -m "feat: add logs viewer with four chart types for data analysis"
```

---

## Task 12: PWA Configuration for iPad

**Files:**
- Create: `frontend/public/manifest.json`
- Create: `frontend/public/icons/` (placeholder)
- Modify: `frontend/public/index.html`
- Create: `frontend/src/serviceWorker.js`

**Step 1: Create PWA manifest**

Create `frontend/public/manifest.json`:

```json
{
  "short_name": "SoundMeter",
  "name": "Sound Meter - Dining Hall Monitor",
  "description": "Monitor and analyze dining hall sound levels",
  "icons": [
    {
      "src": "favicon.ico",
      "sizes": "64x64 32x32 24x24 16x16",
      "type": "image/x-icon"
    },
    {
      "src": "logo192.png",
      "type": "image/png",
      "sizes": "192x192"
    },
    {
      "src": "logo512.png",
      "type": "image/png",
      "sizes": "512x512"
    }
  ],
  "start_url": ".",
  "display": "standalone",
  "theme_color": "#3b82f6",
  "background_color": "#ffffff",
  "orientation": "landscape"
}
```

**Step 2: Create placeholder icons**

```bash
mkdir -p frontend/public/icons
# Note: In production, generate proper icons using a tool like https://realfavicongenerator.net/
```

Create a simple placeholder `frontend/public/favicon.ico` and `frontend/public/logo192.png`, `frontend/public/logo512.png`

**Step 3: Update index.html with PWA meta tags**

Modify `frontend/public/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <meta name="theme-color" content="#3b82f6" />

    <!-- PWA Meta Tags -->
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="SoundMeter" />

    <!-- Icons -->
    <link rel="icon" href="%PUBLIC_URL%/favicon.ico" />
    <link rel="apple-touch-icon" href="%PUBLIC_URL%/logo192.png" />
    <link rel="manifest" href="%PUBLIC_URL%/manifest.json" />

    <title>Sound Meter</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>
```

**Step 4: Create service worker**

Create `frontend/src/serviceWorker.js`:

```js
// Simple service worker for offline capabilities
const CACHE_NAME = 'soundmeter-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/static/css/main.css',
  '/static/js/main.js',
];

export function register() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/service-worker.js')
        .then(registration => {
          console.log('SW registered: ', registration);
        })
        .catch(error => {
          console.log('SW registration failed: ', error);
        });
    });
  }
}

export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then(registration => {
        registration.unregister();
      })
      .catch(error => {
        console.error(error.message);
      });
  }
}
```

**Step 5: Add wake lock to prevent iPad sleep**

Create `frontend/src/utils/wakeLock.js`:

```js
let wakeLock = null;

export const requestWakeLock = async () => {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Wake Lock active');

      wakeLock.addEventListener('release', () => {
        console.log('Wake Lock released');
      });

      return true;
    } catch (err) {
      console.error('Wake Lock error:', err);
      return false;
    }
  }
  return false;
};

export const releaseWakeLock = async () => {
  if (wakeLock !== null) {
    await wakeLock.release();
    wakeLock = null;
  }
};
```

**Step 6: Use wake lock in SoundMeter**

Modify `frontend/src/components/SoundMeter.js` to add at the top of the component:

```js
import { requestWakeLock, releaseWakeLock } from '../utils/wakeLock';

// Inside SoundMeter component, add useEffect:
useEffect(() => {
  if (isRecording) {
    requestWakeLock();
  } else {
    releaseWakeLock();
  }
}, [isRecording]);
```

**Step 7: Test PWA installation**

Run:
```bash
npm run build
```

Serve the build folder and test on iPad Safari: Add to Home Screen should be available

**Step 8: Commit**

```bash
git add frontend/public/manifest.json frontend/public/index.html frontend/src/serviceWorker.js frontend/src/utils/wakeLock.js frontend/src/components/SoundMeter.js
git commit -m "feat: add PWA configuration with wake lock for iPad optimization"
```

---

## Task 13: Documentation and Deployment Setup

**Files:**
- Create: `README.md`
- Create: `backend/.env`
- Create: `DEPLOYMENT.md`

**Step 1: Create comprehensive README**

Create `README.md` in project root:

```markdown
# Sound Meter Web App

A web application for monitoring dining hall sound levels with real-time traffic light display, configurable thresholds, and comprehensive data visualization.

## Features

- **Real-time Sound Monitoring**: Traffic light display (green/yellow/red) based on configurable decibel thresholds
- **Automated Logging**: Records sound levels every 30 seconds during lunch period (11:30-13:30 CET)
- **iPad Optimized**: PWA with touch-friendly interface and wake lock support
- **Data Visualization**: Four chart types for analyzing sound patterns
  - Line overlay comparing multiple time periods
  - Average decibel bar chart
  - Peak noise comparison
  - Traffic light zone percentage breakdown
- **CSV Export**: Download logs for external analysis
- **Configurable**: Adjust thresholds, time slot names, and visual update rate

## Tech Stack

### Backend
- Python 3.10+
- Flask
- SQLite3
- pytz (timezone handling)

### Frontend
- React 18
- Chart.js
- TailwindCSS
- Web Audio API

## Installation

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Create virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Create .env file:
```bash
cp .env.example .env
```

5. Initialize database:
```bash
python init_db.py
```

6. Run backend server:
```bash
python app.py
```

Backend will run on `http://localhost:5000`

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create .env file:
```bash
echo "REACT_APP_API_URL=http://localhost:5000" > .env
```

4. Run development server:
```bash
npm start
```

Frontend will open on `http://localhost:3000`

## Usage

### On iPad

1. Open Safari and navigate to the app URL
2. Tap Share button → Add to Home Screen
3. Launch the app from home screen
4. Grant microphone permission when prompted
5. App will automatically start recording during lunch hours (11:30-13:30 CET)

### Configuration

Navigate to the Configuration tab to:
- Adjust green/yellow threshold sliders
- Rename time slot periods
- Change visual update rate (0.5s or 1s)

### Viewing Logs

Navigate to the Logs tab to:
- Select date and time periods to analyze
- View four different chart types
- Export data as CSV

## Default Settings

- **Green Zone**: ≤ 60 dB
- **Yellow Zone**: 60-80 dB
- **Red Zone**: > 80 dB
- **Visual Update Rate**: 1 second
- **Log Interval**: 30 seconds
- **Recording Hours**: 11:30-13:30 CET

## Testing

### Backend Tests
```bash
cd backend
pytest tests/ -v
```

### Frontend Tests
```bash
cd frontend
npm test
```

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for production deployment instructions.

## License

MIT
```

**Step 2: Create backend .env file**

Create `backend/.env`:

```
FLASK_ENV=production
TIMEZONE=Europe/Paris
DATABASE_PATH=soundmeter.db
```

**Step 3: Create deployment guide**

Create `DEPLOYMENT.md`:

```markdown
# Deployment Guide

## Local Network Deployment (Raspberry Pi)

### Requirements
- Raspberry Pi 4 (2GB+ RAM recommended)
- Raspbian OS
- Python 3.10+
- Node.js 16+

### Steps

1. **Clone repository on Raspberry Pi**
```bash
git clone <repository-url>
cd SoundMeter
```

2. **Setup backend**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python init_db.py
```

3. **Build frontend**
```bash
cd ../frontend
npm install
npm run build
```

4. **Configure Flask to serve frontend**

Modify `backend/app.py` to add:
```python
from flask import send_from_directory
import os

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    frontend_dir = os.path.join(os.path.dirname(__file__), '../frontend/build')
    if path and os.path.exists(os.path.join(frontend_dir, path)):
        return send_from_directory(frontend_dir, path)
    return send_from_directory(frontend_dir, 'index.html')
```

5. **Run with production server (Gunicorn)**
```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

6. **Setup systemd service for auto-start**

Create `/etc/systemd/system/soundmeter.service`:
```ini
[Unit]
Description=Sound Meter Application
After=network.target

[Service]
User=pi
WorkingDirectory=/home/pi/SoundMeter/backend
Environment="PATH=/home/pi/SoundMeter/backend/venv/bin"
ExecStart=/home/pi/SoundMeter/backend/venv/bin/gunicorn -w 4 -b 0.0.0.0:5000 app:app
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable service:
```bash
sudo systemctl enable soundmeter
sudo systemctl start soundmeter
```

7. **Access from iPad**

Find Raspberry Pi IP address:
```bash
hostname -I
```

On iPad Safari, navigate to: `http://<raspberry-pi-ip>:5000`

## Cloud Deployment (PythonAnywhere)

### Steps

1. **Sign up for PythonAnywhere** (free tier available)

2. **Upload code**
```bash
# On PythonAnywhere bash console
git clone <repository-url>
cd SoundMeter
```

3. **Setup virtual environment**
```bash
cd backend
mkvirtualenv soundmeter --python=python3.10
pip install -r requirements.txt
python init_db.py
```

4. **Configure Web App**
- Go to Web tab
- Add new web app
- Choose Flask
- Set source code directory
- Set virtual environment path
- Update WSGI file to point to app.py

5. **Build and upload frontend**
```bash
cd frontend
npm run build
# Upload build folder to PythonAnywhere static files
```

6. **Configure static files mapping**
- Static URL: `/static`
- Directory: `/home/yourusername/SoundMeter/frontend/build/static`

7. **Reload web app**

Access at: `https://yourusername.pythonanywhere.com`

## Environment Variables

Ensure these are set in production:

```
FLASK_ENV=production
TIMEZONE=Europe/Paris
DATABASE_PATH=/path/to/soundmeter.db
```

## Security Considerations

1. **HTTPS**: Use HTTPS in production (free with Let's Encrypt)
2. **CORS**: Update CORS settings to only allow your domain
3. **Rate Limiting**: Add rate limiting to API endpoints
4. **Database Backups**: Schedule regular SQLite database backups

## Maintenance

### Database Backup
```bash
sqlite3 soundmeter.db ".backup soundmeter_backup.db"
```

### View Logs
```bash
tail -f /var/log/soundmeter.log
```

### Update Application
```bash
git pull
systemctl restart soundmeter
```
```

**Step 4: Commit documentation**

```bash
git add README.md DEPLOYMENT.md backend/.env
git commit -m "docs: add comprehensive README and deployment guide"
```

---

## Final Steps

**Step 1: Run all tests**

```bash
cd backend
pytest tests/ -v
```

Expected: All tests pass

**Step 2: Test full integration**

1. Start backend: `cd backend && python app.py`
2. Start frontend: `cd frontend && npm start`
3. Test complete workflow:
   - Monitor tab shows traffic light
   - Configuration tab allows threshold changes
   - Logs tab displays charts
   - CSV export works

**Step 3: Create final commit**

```bash
git add -A
git commit -m "feat: complete sound meter web app implementation

- Flask backend with SQLite database
- Real-time audio processing with Web Audio API
- Traffic light display with configurable thresholds
- Four visualization chart types
- CSV export functionality
- PWA configuration for iPad
- Comprehensive documentation"
```

**Step 4: Tag release**

```bash
git tag -a v1.0.0 -m "Release version 1.0.0 - Complete sound meter app"
```

---

## Implementation Complete

The sound meter application is now fully implemented with:

✅ Backend API with configuration, logging, and export endpoints
✅ Real-time audio processing and decibel measurement
✅ Traffic light display with visual feedback
✅ Configuration panel for thresholds and time slot names
✅ Logs viewer with four chart types
✅ CSV export functionality
✅ PWA optimization for iPad
✅ Comprehensive documentation and deployment guides
✅ Test coverage for backend functionality

The app is ready for deployment and testing on iPad devices.
