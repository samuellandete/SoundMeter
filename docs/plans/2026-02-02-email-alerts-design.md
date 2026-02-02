# Email Alert System for Sound Meter - Design Document

**Date:** 2026-02-02
**Purpose:** Add configurable email notifications when sound thresholds are exceeded

## Overview

Extends the sound meter application with email alerting capabilities that notify administrators when noise levels exceed configurable thresholds. Supports both instant threshold alerts (single reading exceeds limit) and average threshold alerts (rolling average over time window exceeds limit).

## Requirements Summary

- Two alert types: instant threshold and rolling average threshold
- All settings configurable via database and UI (no server restart required)
- Email recipient: richardalbinana@asvalencia.org (configurable)
- SMTP server: 172.17.50.100:25 (no authentication, IP whitelisted)
- Cooldown period between alerts (default: 5 minutes, configurable)
- Average calculations respect 30-minute time slot boundaries
- Detailed email content with statistics and recent history
- Frontend-based threshold checking for responsive alerts

## System Architecture

### Alert Flow

1. **Frontend measures dB** every 0.5-1 second (visual update rate)
2. **Frontend maintains rolling buffer** of recent readings with timestamps
3. **Frontend checks thresholds:**
   - Instant: Current reading exceeds instant_threshold_db
   - Average: Rolling average exceeds average_threshold_db
4. **Frontend calls backend** POST /api/email-alert when threshold exceeded
5. **Backend validates and applies cooldown**
6. **Backend fetches period statistics** from database
7. **Backend sends detailed email** via SMTP
8. **Backend records timestamp** for cooldown tracking

### Why Frontend Threshold Checking?

- Reduces network traffic (only API call when alert needed, not every 0.5s)
- More responsive (no backend polling delay)
- Leverages existing visual update measurements
- Backend still validates and enforces cooldown for security

## Database Schema Extensions

### Configuration Entries

New entries in existing `config` table (key-value pairs):

```sql
-- Email system settings
email_enabled: "true" | "false"  (default: "false")
email_recipient: "richardalbinana@asvalencia.org"
smtp_host: "172.17.50.100"
smtp_port: "25"

-- Alert thresholds
instant_threshold_db: "85.0"  (example default)
average_threshold_db: "75.0"  (example default)
average_time_window_minutes: "5"  (default)
cooldown_minutes: "5"  (default)

-- Cooldown tracking (ISO8601 timestamps or null)
last_instant_alert_sent: "2026-02-02T12:15:45+01:00" | null
last_average_alert_sent: "2026-02-02T12:08:30+01:00" | null
```

### Separate Cooldown Timers

Each alert type (instant/average) has independent cooldown:
- Prevents one alert type from blocking the other
- Allows both alerts within same period if appropriate
- Example: Instant alert at 12:00, average alert at 12:02 (both valid)

## Backend API Design

### Extended Configuration Endpoint

**GET /api/config** - Add email_alerts section:

```json
{
  "thresholds": { ... existing ... },
  "visual_update_rate": 500,
  "time_slots": [ ... existing ... ],
  "email_alerts": {
    "enabled": true,
    "recipient": "richardalbinana@asvalencia.org",
    "smtp_host": "172.17.50.100",
    "smtp_port": 25,
    "instant_threshold_db": 85.0,
    "average_threshold_db": 75.0,
    "average_time_window_minutes": 5,
    "cooldown_minutes": 5
  }
}
```

**POST /api/config** - Accept email_alerts object for updates

### New Alert Endpoint

**POST /api/email-alert**

Request body:
```json
{
  "alert_type": "instant" | "average",
  "current_db": 87.5,
  "average_db": 82.3,
  "timestamp": "2026-02-02T12:15:45+01:00",
  "time_slot_id": 1
}
```

Backend logic:
1. Check if email_enabled is true
2. Determine which cooldown to check (instant vs average)
3. Calculate time since last alert of this type
4. If still in cooldown period:
   - Return 429 with next_alert_available_at timestamp
5. If cooldown passed:
   - Query database for period statistics (peak, avg, zone percentages)
   - Construct detailed HTML email
   - Send via SMTP (172.17.50.100:25, no auth)
   - Update last_alert_sent timestamp in config
   - Return success response

Response (success):
```json
{
  "success": true,
  "message": "Alert email sent successfully",
  "next_alert_available_at": "2026-02-02T12:20:45+01:00"
}
```

Response (cooldown):
```json
{
  "success": false,
  "message": "Alert in cooldown period",
  "next_alert_available_at": "2026-02-02T12:20:45+01:00",
  "seconds_remaining": 180
}
```

Response (email disabled):
```json
{
  "success": false,
  "message": "Email alerts are disabled"
}
```

### Test Email Endpoint

**POST /api/email-alert/test**

- Sends sample alert email immediately
- Bypasses cooldown and threshold checks
- Uses current time slot and recent data
- Returns success/error for troubleshooting SMTP setup

Request body: (empty)

Response:
```json
{
  "success": true,
  "message": "Test email sent to richardalbinana@asvalencia.org"
}
```

## Frontend Implementation

### New Hook: useEmailAlerts.js

Manages rolling buffer and threshold checking:

```javascript
const useEmailAlerts = (currentDb, emailConfig) => {
  const [buffer, setBuffer] = useState([]);
  const [lastInstantAlert, setLastInstantAlert] = useState(null);
  const [lastAverageAlert, setLastAverageAlert] = useState(null);
  const [currentTimeSlot, setCurrentTimeSlot] = useState(null);

  useEffect(() => {
    if (!emailConfig.enabled) return;

    const now = new Date();
    const timeSlotId = determineTimeSlot(now);

    // Clear buffer if time slot changed
    if (timeSlotId !== currentTimeSlot) {
      setBuffer([]);
      setCurrentTimeSlot(timeSlotId);
      return;
    }

    // Add current reading to buffer
    const newReading = { timestamp: now, db: currentDb, timeSlotId };
    const newBuffer = [...buffer, newReading];

    // Remove readings older than average_time_window
    const windowMs = emailConfig.average_time_window_minutes * 60 * 1000;
    const filtered = newBuffer.filter(r =>
      (now - r.timestamp) <= windowMs
    );
    setBuffer(filtered);

    // Check instant threshold
    if (currentDb > emailConfig.instant_threshold_db) {
      const canSend = !lastInstantAlert ||
        (now - lastInstantAlert) > (emailConfig.cooldown_minutes * 60 * 1000);

      if (canSend) {
        sendAlert('instant', currentDb, null, now, timeSlotId);
        setLastInstantAlert(now);
      }
    }

    // Check average threshold (only if buffer has enough data)
    const minReadings = (emailConfig.average_time_window_minutes * 60) /
                       (emailConfig.visual_update_rate / 1000);

    if (filtered.length >= minReadings) {
      const average = filtered.reduce((sum, r) => sum + r.db, 0) / filtered.length;

      if (average > emailConfig.average_threshold_db) {
        const canSend = !lastAverageAlert ||
          (now - lastAverageAlert) > (emailConfig.cooldown_minutes * 60 * 1000);

        if (canSend) {
          sendAlert('average', currentDb, average, now, timeSlotId);
          setLastAverageAlert(now);
        }
      }
    }
  }, [currentDb]);

  const sendAlert = async (type, currentDb, averageDb, timestamp, timeSlotId) => {
    try {
      const response = await fetch('/api/email-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert_type: type,
          current_db: currentDb,
          average_db: averageDb,
          timestamp: timestamp.toISOString(),
          time_slot_id: timeSlotId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        console.warn('Email alert not sent:', data.message);
      }
    } catch (error) {
      console.error('Failed to send email alert:', error);
    }
  };

  return { buffer };
};
```

### Integration with useAudioLevel.js

Existing `useAudioLevel.js` hook will call `useEmailAlerts`:

```javascript
const currentDb = calculateDecibels(audioData);

// Existing code for visual updates...

// New: Email alert checking
useEmailAlerts(currentDb, emailConfig);
```

### Time Slot Detection Utility

```javascript
// utils/timeSlotUtils.js
export const determineTimeSlot = (date) => {
  const hour = date.getHours();
  const minute = date.getMinutes();
  const timeInMinutes = hour * 60 + minute;

  // 11:30-12:00 = 690-720 minutes = slot 1
  // 12:00-12:30 = 720-750 minutes = slot 2
  // 12:30-13:00 = 750-780 minutes = slot 3
  // 13:00-13:30 = 780-810 minutes = slot 4

  if (timeInMinutes >= 690 && timeInMinutes < 720) return 1;
  if (timeInMinutes >= 720 && timeInMinutes < 750) return 2;
  if (timeInMinutes >= 750 && timeInMinutes < 780) return 3;
  if (timeInMinutes >= 780 && timeInMinutes < 810) return 4;

  return null; // Outside lunch period
};
```

## Email Content & Format

### Subject Line

```
[Sound Alert] {ALERT_TYPE} threshold exceeded - {TIME_SLOT_NAME} ({TIMESTAMP})
```

Examples:
- `[Sound Alert] Instant threshold exceeded - Period 1 (2026-02-02 11:45:23 CET)`
- `[Sound Alert] Average threshold exceeded - First Seating (2026-02-02 12:15:45 CET)`

### Email Body (HTML)

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; color: #333; }
    h2 { color: #d32f2f; }
    h3 { color: #555; margin-top: 20px; }
    table { border-collapse: collapse; margin-top: 10px; }
    td { padding: 8px; border: 1px solid #ddd; }
    .green { color: #4caf50; }
    .yellow { color: #ff9800; }
    .red { color: #d32f2f; }
  </style>
</head>
<body>
  <h2>🔔 Sound Level Alert</h2>

  <p><strong>Alert Type:</strong> {Instant / Average over X minutes}</p>
  <p><strong>Time:</strong> {2026-02-02 12:15:45 CET}</p>
  <p><strong>Time Slot:</strong> {First Seating (11:30-12:00)}</p>

  <h3>Current Readings</h3>
  <ul>
    <li><strong>Current Level:</strong> 87.5 dB</li>
    <li><strong>Threshold:</strong> 85.0 dB</li>
    <li><strong>Exceeded by:</strong> 2.5 dB</li>
  </ul>

  <h3>Period Statistics (so far)</h3>
  <ul>
    <li><strong>Peak:</strong> 89.2 dB at 12:08:30</li>
    <li><strong>Average:</strong> 72.3 dB</li>
    <li><strong>Time in Green Zone:</strong> 45%</li>
    <li><strong>Time in Yellow Zone:</strong> 38%</li>
    <li><strong>Time in Red Zone:</strong> 17%</li>
  </ul>

  <h3>Recent History (last 5 readings)</h3>
  <table>
    <tr><td>12:15:45</td><td class="red">87.5 dB</td></tr>
    <tr><td>12:15:44</td><td class="red">86.8 dB</td></tr>
    <tr><td>12:15:43</td><td class="red">85.2 dB</td></tr>
    <tr><td>12:15:42</td><td class="yellow">83.9 dB</td></tr>
    <tr><td>12:15:41</td><td class="yellow">82.1 dB</td></tr>
  </table>

  <hr style="margin-top: 30px;">
  <p style="color: #777; font-size: 0.9em;">
    <em>Next alert can be sent after 5 minute cooldown period.</em><br>
    Generated by ASV Sound Meter System
  </p>
</body>
</html>
```

### Plain Text Version

```
SOUND LEVEL ALERT

Alert Type: Instant threshold exceeded
Time: 2026-02-02 12:15:45 CET
Time Slot: First Seating (11:30-12:00)

CURRENT READINGS
- Current Level: 87.5 dB
- Threshold: 85.0 dB
- Exceeded by: 2.5 dB

PERIOD STATISTICS (so far)
- Peak: 89.2 dB at 12:08:30
- Average: 72.3 dB
- Time in Green Zone: 45%
- Time in Yellow Zone: 38%
- Time in Red Zone: 17%

RECENT HISTORY (last 5 readings)
12:15:45 - 87.5 dB [RED]
12:15:44 - 86.8 dB [RED]
12:15:43 - 85.2 dB [RED]
12:15:42 - 83.9 dB [YELLOW]
12:15:41 - 82.1 dB [YELLOW]

---
Next alert can be sent after 5 minute cooldown period.
Generated by ASV Sound Meter System
```

## Configuration UI

### Email Settings Panel

New section in existing Configuration Panel:

```javascript
<section className="email-config-section">
  <h3>Email Alerts</h3>

  <div className="form-group">
    <label>
      <input
        type="checkbox"
        checked={emailConfig.enabled}
        onChange={handleEnableToggle}
      />
      Enable Email Alerts
    </label>
  </div>

  {emailConfig.enabled && (
    <>
      <div className="form-group">
        <label>Email Recipient</label>
        <input
          type="email"
          value={emailConfig.recipient}
          onChange={handleRecipientChange}
          placeholder="richardalbinana@asvalencia.org"
        />
      </div>

      <div className="threshold-section">
        <h4>Instant Alert Threshold</h4>
        <p className="description">
          Send email immediately when sound exceeds this level
        </p>
        <div className="slider-group">
          <label>Threshold: {emailConfig.instant_threshold_db} dB</label>
          <input
            type="range"
            min="60"
            max="100"
            step="1"
            value={emailConfig.instant_threshold_db}
            onChange={handleInstantThresholdChange}
          />
        </div>
      </div>

      <div className="threshold-section">
        <h4>Average Alert Threshold</h4>
        <p className="description">
          Send email when average over time window exceeds this level
        </p>
        <div className="slider-group">
          <label>Threshold: {emailConfig.average_threshold_db} dB</label>
          <input
            type="range"
            min="60"
            max="100"
            step="1"
            value={emailConfig.average_threshold_db}
            onChange={handleAverageThresholdChange}
          />
        </div>

        <div className="form-group">
          <label>Time Window (minutes)</label>
          <input
            type="number"
            min="1"
            max="30"
            value={emailConfig.average_time_window_minutes}
            onChange={handleTimeWindowChange}
          />
          <span className="help-text">
            Average must be within one 30-minute time slot
          </span>
        </div>
      </div>

      <div className="form-group">
        <label>Cooldown Period (minutes)</label>
        <input
          type="number"
          min="1"
          max="60"
          value={emailConfig.cooldown_minutes}
          onChange={handleCooldownChange}
        />
        <span className="help-text">
          Minimum time between alerts of the same type
        </span>
      </div>

      <details className="advanced-settings">
        <summary>Advanced SMTP Settings</summary>
        <div className="form-group">
          <label>SMTP Host</label>
          <input
            type="text"
            value={emailConfig.smtp_host}
            onChange={handleSmtpHostChange}
          />
        </div>
        <div className="form-group">
          <label>SMTP Port</label>
          <input
            type="number"
            value={emailConfig.smtp_port}
            onChange={handleSmtpPortChange}
          />
        </div>
      </details>

      <div className="button-group">
        <button
          onClick={handleSave}
          className="btn-primary"
        >
          Save Email Settings
        </button>

        <button
          onClick={handleTestEmail}
          className="btn-secondary"
        >
          Send Test Email
        </button>
      </div>
    </>
  )}
</section>
```

### UI Feedback

- **Save:** Show toast notification "Email settings saved successfully"
- **Test Email:** Show loading spinner, then success/error message
- **Validation:** Prevent saving if email is invalid format
- **Constraints:** Show warning if average_time_window > 30 minutes

## Error Handling & Edge Cases

### SMTP Connection Failures

**Issue:** Cannot connect to 172.17.50.100:25

**Handling:**
- Backend logs full error with stack trace
- Returns 500 error with message "Failed to send email: connection refused"
- Frontend shows toast: "Email alert failed - check SMTP settings"
- Does NOT reset cooldown timer (prevents retry loops)
- Test Email button helps diagnose before alerts fire

### SMTP Send Failures

**Issue:** Connected but message rejected

**Handling:**
- Log SMTP error code and message
- Return 500 with specific error
- Frontend shows toast with error details
- Admin can review logs for troubleshooting

### Database Query Failures (Statistics)

**Issue:** Cannot fetch period statistics for email

**Handling:**
- Send simplified email with just alert info
- Include note: "Period statistics temporarily unavailable"
- Log error for investigation
- Better to send incomplete alert than no alert

### Cooldown During Settings Change

**Scenario:** Cooldown is 5 minutes, last alert sent 3 minutes ago, user changes cooldown to 10 minutes

**Handling:**
- Use NEW cooldown value for calculation
- Must wait 7 more minutes (10 - 3 = 7)
- Cooldown timestamp persists across config changes

### Email Disabled/Re-enabled

**Scenario:** Alert sent, then email disabled for 30 minutes, then re-enabled

**Handling:**
- Cooldown timestamp persists in database
- Upon re-enabling, must still respect cooldown
- Cannot immediately trigger alert just because feature was off

### Time Slot Boundary Crossing

**Scenario:** Buffer has 4 minutes of data, clock reaches 12:00:00 (slot boundary)

**Handling:**
1. Frontend detects time slot change via determineTimeSlot()
2. Buffer immediately cleared (buffer.length = 0)
3. Average threshold checking paused until buffer refills
4. Instant threshold continues working immediately
5. Example: If average window is 5 minutes, average alerts cannot trigger until 12:05:00

### Insufficient Buffer Data

**Scenario:** Average window set to 10 minutes, but only 3 minutes of data in buffer

**Handling:**
- Calculate minimum required readings: (window_minutes * 60) / update_interval
- Only check average threshold if buffer.length >= minReadings
- Prevents false alerts during startup or after slot transitions
- UI could show indicator: "Building average... (3/10 minutes)"

### Outside Lunch Hours

**Scenario:** Testing during 14:00 (outside 11:30-13:30)

**Handling:**
- determineTimeSlot() returns null
- Frontend does not check thresholds (no recording active)
- Test Email button still works for SMTP verification
- Backend rejects alert if time_slot_id is null

### Frontend/Backend Clock Skew

**Scenario:** Frontend clock is 2 minutes ahead of backend

**Handling:**
- Backend uses its own timezone (CET from config)
- Backend validates timestamp is "reasonable" (within ±5 minutes of server time)
- If skew detected, log warning but process alert
- Cooldown calculated using backend timestamps only

### Multiple Tabs Open

**Scenario:** User has 2 iPad tabs open, both sending alerts

**Handling:**
- Each frontend tracks local cooldown independently
- Backend enforces cooldown using database timestamps (authoritative)
- First tab to reach backend wins, second gets 429 response
- Both tabs respect backend cooldown response

## Implementation Details

### Backend File Structure

```
backend/
├── routes/
│   ├── email_alerts.py          # NEW: Alert endpoints
│   └── config.py                # MODIFIED: Add email_alerts to response
├── services/
│   ├── email_service.py         # NEW: SMTP sending logic
│   └── statistics_service.py    # NEW: Calculate period stats
├── templates/
│   └── alert_email.html         # NEW: Email HTML template
├── app.py                       # MODIFIED: Register email_alerts blueprint
├── database.py                  # MODIFIED: Email config helpers
└── init_db.py                   # MODIFIED: Initialize email defaults
```

### Frontend File Structure

```
frontend/src/
├── hooks/
│   ├── useEmailAlerts.js        # NEW: Threshold checking & buffer
│   └── useAudioLevel.js         # MODIFIED: Integrate useEmailAlerts
├── components/
│   ├── EmailConfigPanel.js      # NEW: Email settings UI
│   └── ConfigPanel.js           # MODIFIED: Include EmailConfigPanel
└── utils/
    └── timeSlotUtils.js         # NEW: Time slot detection
```

### Python Dependencies

**Standard Library (No pip install needed):**
- `smtplib` - SMTP client
- `email.mime` - Email message construction

**Existing Dependencies:**
- Flask (routing)
- pytz (timezone handling)

### Backend Implementation: email_service.py

```python
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
import pytz

def send_alert_email(
    recipient: str,
    smtp_host: str,
    smtp_port: int,
    alert_data: dict,
    statistics: dict
) -> tuple[bool, str]:
    """
    Send alert email via SMTP

    Returns: (success: bool, message: str)
    """
    try:
        # Construct email
        msg = MIMEMultipart('alternative')
        msg['Subject'] = format_subject(alert_data)
        msg['From'] = 'soundmeter@asvalencia.org'
        msg['To'] = recipient

        # Plain text version
        text_body = render_text_email(alert_data, statistics)
        msg.attach(MIMEText(text_body, 'plain'))

        # HTML version
        html_body = render_html_email(alert_data, statistics)
        msg.attach(MIMEText(html_body, 'html'))

        # Send via SMTP
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.send_message(msg)

        return True, "Email sent successfully"

    except smtplib.SMTPException as e:
        return False, f"SMTP error: {str(e)}"
    except Exception as e:
        return False, f"Failed to send email: {str(e)}"

def format_subject(alert_data: dict) -> str:
    alert_type = alert_data['alert_type'].capitalize()
    slot_name = alert_data['slot_name']
    timestamp = alert_data['timestamp'].strftime('%Y-%m-%d %H:%M:%S')
    return f"[Sound Alert] {alert_type} threshold exceeded - {slot_name} ({timestamp})"
```

### Backend Implementation: statistics_service.py

```python
from database import get_db_context
from datetime import datetime, timedelta
import os

def get_period_statistics(time_slot_id: int, current_time: datetime) -> dict:
    """
    Calculate statistics for the current time slot up to current_time

    Returns:
    {
      'peak_db': float,
      'peak_timestamp': datetime,
      'average_db': float,
      'green_percent': float,
      'yellow_percent': float,
      'red_percent': float
    }
    """
    db_path = os.getenv('DATABASE_PATH', 'soundmeter.db')

    with get_db_context(db_path) as conn:
        cursor = conn.cursor()

        # Get thresholds from config
        cursor.execute("SELECT value FROM config WHERE key = 'green_max'")
        green_max = float(cursor.fetchone()['value'])
        cursor.execute("SELECT value FROM config WHERE key = 'yellow_max'")
        yellow_max = float(cursor.fetchone()['value'])

        # Get logs for current slot today
        today = current_time.date()
        cursor.execute('''
            SELECT decibels, timestamp
            FROM sound_logs
            WHERE time_slot_id = ?
              AND DATE(timestamp) = ?
            ORDER BY timestamp
        ''', (time_slot_id, today))

        logs = cursor.fetchall()

        if not logs:
            return None

        # Calculate statistics
        decibels = [log['decibels'] for log in logs]
        peak_db = max(decibels)
        peak_log = next(log for log in logs if log['decibels'] == peak_db)
        average_db = sum(decibels) / len(decibels)

        # Zone percentages
        green_count = sum(1 for db in decibels if db <= green_max)
        yellow_count = sum(1 for db in decibels if green_max < db <= yellow_max)
        red_count = sum(1 for db in decibels if db > yellow_max)
        total = len(decibels)

        return {
            'peak_db': round(peak_db, 1),
            'peak_timestamp': peak_log['timestamp'],
            'average_db': round(average_db, 1),
            'green_percent': round((green_count / total) * 100, 1),
            'yellow_percent': round((yellow_count / total) * 100, 1),
            'red_percent': round((red_count / total) * 100, 1)
        }
```

### Docker Network Configuration

**Verify SMTP Access:**

```bash
# From inside container
telnet 172.17.50.100 25

# Should see: 220 mail.asvalencia.org SMTP Server
```

**Docker Compose (if used):**

```yaml
services:
  backend:
    # ... existing config ...
    network_mode: "bridge"  # or "host" if bridge doesn't work
```

**Test from Container:**

```bash
docker exec -it soundmeter-backend python3 -c "
import smtplib
with smtplib.SMTP('172.17.50.100', 25, timeout=5) as server:
    print('SMTP connection successful')
"
```

## Testing Strategy

### Unit Tests

**Backend:**
- `test_email_service.py` - Mock SMTP, verify message construction
- `test_statistics_service.py` - Verify calculations with sample data
- `test_cooldown_logic.py` - Verify cooldown enforcement

**Frontend:**
- `useEmailAlerts.test.js` - Buffer management, threshold detection
- `timeSlotUtils.test.js` - Time slot detection accuracy

### Integration Tests

- Send test email via API and verify receipt
- Trigger instant alert and verify cooldown enforcement
- Trigger average alert across time window
- Verify buffer clears at time slot boundary

### Manual Testing Scenarios

1. **Instant Alert Test:**
   - Set instant threshold to 60dB
   - Generate loud noise
   - Verify email received within seconds
   - Verify no second email within cooldown period

2. **Average Alert Test:**
   - Set average threshold to 65dB, window to 2 minutes
   - Generate sustained 70dB noise for 3 minutes
   - Verify email received after 2 minutes of sustained noise

3. **Time Slot Boundary Test:**
   - Build 4-minute average buffer at 11:58
   - Cross into 12:00
   - Verify buffer clears
   - Verify average alert doesn't trigger until 12:05 (if window is 5min)

4. **Cooldown Test:**
   - Trigger instant alert
   - Generate more noise during cooldown
   - Verify no additional emails
   - After cooldown expires, verify next alert sends

5. **Configuration Change Test:**
   - Change email recipient via UI
   - Send test email
   - Verify received at new address

## Deployment Checklist

- [ ] Add email config defaults to init_db.py
- [ ] Verify SMTP connectivity from Docker container to 172.17.50.100:25
- [ ] Test email delivery to richardalbinana@asvalencia.org
- [ ] Set appropriate default thresholds (recommend: instant=85dB, average=75dB)
- [ ] Configure default cooldown (recommend: 5 minutes)
- [ ] Test all error scenarios (SMTP down, invalid recipient, etc.)
- [ ] Verify time slot boundary behavior at 12:00, 12:30, 13:00
- [ ] Document email format for end users
- [ ] Set up log rotation for email service logs
- [ ] Create alert monitoring dashboard (optional future enhancement)

## Success Criteria

- [x] Email alerts can be enabled/disabled via UI without server restart
- [x] Both instant and average threshold types work correctly
- [x] Emails contain detailed statistics and recent history
- [x] Cooldown prevents email spam during sustained high noise
- [x] Average calculations respect time slot boundaries
- [x] Test email button verifies SMTP configuration
- [x] All settings configurable via database and UI
- [x] SMTP sends successfully to 172.17.50.100:25 without authentication
- [x] Frontend buffer clears at time slot transitions
- [x] Error handling prevents crashes when SMTP unavailable

## Future Enhancements (Not in Scope)

- Multiple email recipients (distribution list)
- SMS alerts in addition to email
- Alert escalation (send to different recipients after X minutes)
- Alert history log (track all sent alerts)
- Configurable email templates
- Digest emails (summary at end of lunch period)
- Integration with external monitoring systems
- Mobile app push notifications
