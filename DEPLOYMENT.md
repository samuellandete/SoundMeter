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

5. **Migrate existing database (if upgrading)**
```bash
# If upgrading from version without email alerts
python migrate_email_alerts.py soundmeter.db
```

6. **Run with production server (Gunicorn)**
```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

7. **Setup systemd service for auto-start**

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

8. **Access from iPad**

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

## Email Alerts Configuration

After deployment, configure email alerts via the web interface:

1. Navigate to Configuration tab
2. Scroll to "Email Alerts" section
3. Enable email alerts toggle
4. Configure settings:
   - **Recipient Email**: Email address to receive alerts
   - **SMTP Host**: 172.17.50.100 (ASV internal) or external SMTP server
   - **SMTP Port**: 25 (default) or your SMTP port
   - **Instant Threshold**: Decibel level for immediate alerts (default: 85 dB)
   - **Average Threshold**: Rolling average threshold (default: 75 dB)
   - **Average Window**: Time window for average calculation (default: 5 minutes)
   - **Cooldown Period**: Minimum time between alerts (default: 5 minutes)
5. Click "Send Test Email" to verify configuration
6. Save configuration

See [docs/EMAIL_ALERTS.md](docs/EMAIL_ALERTS.md) for complete documentation.

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

# If database schema changed, run migrations
cd backend
python migrate_email_alerts.py

# Restart service
sudo systemctl restart soundmeter
```
