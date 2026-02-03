# Email Alerts System

## Overview

The Sound Meter application includes an automated email alert system that sends notifications when sound levels exceed configurable thresholds. The system supports both instant threshold alerts and rolling average alerts, with built-in cooldown periods to prevent alert spam.

## Features

- **Instant Threshold Alerts**: Immediate notifications when sound levels exceed a specified decibel threshold
- **Rolling Average Alerts**: Notifications when the average sound level over a time window exceeds a threshold
- **Time Slot Awareness**: Alerts only trigger during configured time slots, not during lunch hours or off-hours
- **Cooldown Periods**: Configurable minimum time between alerts of the same type to prevent spam
- **Detailed Statistics**: Email includes period statistics (peak, average, zone distribution, recent readings)
- **Test Email Functionality**: Send test emails to verify SMTP configuration

## Architecture

### Backend Components

#### 1. Database Schema (`backend/database.py`)
Email configuration is stored in the `config` table:
- `email_enabled`: Enable/disable email alerts (boolean string)
- `email_recipient`: Recipient email address
- `smtp_host`: SMTP server hostname/IP
- `smtp_port`: SMTP server port
- `instant_threshold_db`: Decibel threshold for instant alerts
- `average_threshold_db`: Decibel threshold for average alerts
- `average_time_window_minutes`: Time window for rolling average calculation
- `cooldown_minutes`: Minimum time between alerts of same type
- `last_instant_alert_sent`: Timestamp of last instant alert (for cooldown)
- `last_average_alert_sent`: Timestamp of last average alert (for cooldown)

#### 2. Email Service (`backend/services/email_service.py`)
Handles email composition and sending:
- `send_alert_email()`: Main function to send alert emails via SMTP
- `format_subject()`: Creates alert-specific subject lines
- `render_text_email()`: Generates plain text email body
- `render_html_email()`: Generates styled HTML email with statistics

**Email Format**:
- Multipart MIME (HTML + plain text)
- Sender: soundmeter@asvalencia.org
- Subject: Includes alert type and decibel level with emoji indicators
- Body: Contains alert details, current readings, period statistics, and context

#### 3. Statistics Service (`backend/services/statistics_service.py`)
Calculates period statistics for emails:
- `get_period_statistics()`: Calculates peak, average, zone distribution for current period
- `get_recent_readings()`: Fetches last N readings with zone classification
- `get_zone_from_db()`: Determines green/yellow/red zone from decibel value

#### 4. Email Alerts API (`backend/routes/email_alerts.py`)
REST endpoints for email alerts:
- `POST /api/email-alert`: Send email alert with threshold checking and cooldown enforcement
- `POST /api/email-alert/test`: Send test email with sample data

**Request Format** (`/api/email-alert`):
```json
{
  "alert_type": "instant" | "average",
  "current_db": 87.5,
  "average_db": 76.5,  // Optional, for average alerts
  "timestamp": "2026-02-02T11:45:00+01:00",
  "time_slot_id": 1
}
```

**Response** (Success):
```json
{
  "success": true,
  "message": "Alert email sent successfully",
  "next_alert_available_at": "2026-02-02T11:50:00+01:00"
}
```

**Response** (Cooldown):
```json
{
  "success": false,
  "message": "Alert in cooldown period",
  "next_alert_available_at": "2026-02-02T11:50:00+01:00",
  "seconds_remaining": 180
}
```
Status: `429 Too Many Requests`

#### 5. Config API Extension (`backend/routes/config.py`)
Extended to include email alerts configuration:
- `GET /api/config`: Returns `email_alerts` section with all settings
- `POST /api/config`: Accepts `email_alerts` object for updates

### Frontend Components

#### 1. Time Slot Utilities (`frontend/src/utils/timeSlotUtils.js`)
Time-based helper functions:
- `getCurrentTimeSlot(timeSlots, currentTime)`: Detects current time slot
- `isLunchHour(timeSlots, currentTime)`: Checks if current time is in a gap between slots
- `getMinutesUntilNextSlot(timeSlots, currentTime)`: Helper for countdown timers

#### 2. Email Alerts Hook (`frontend/src/hooks/useEmailAlerts.js`)
Custom React hook for managing email alerts:
- Maintains rolling buffer of decibel readings for average calculations
- Provides `checkThresholds()` function to evaluate readings and send alerts
- Handles cooldown detection and API communication
- Includes buffer management utilities

**Usage Example**:
```javascript
const { checkThresholds, clearBuffer, getBufferStatus } = useEmailAlerts();

// Check thresholds when logging
const result = await checkThresholds(currentDb, config, timeSlots);
if (result.instantCheck?.triggered) {
  console.log('Instant alert sent:', result.instantCheck.alertSent);
}
```

#### 3. Sound Meter Integration (`frontend/src/components/SoundMeter.js`)
Integrated email alert checking:
- Calls `checkThresholds()` every 30 seconds (when logging)
- Only checks if email alerts are enabled and time slots are available
- Logs alert results to console for debugging

#### 4. Email Configuration Panel (`frontend/src/components/EmailConfigPanel.js`)
User interface for email settings:
- Enable/disable toggle
- Recipient email input
- SMTP host and port configuration
- Instant and average threshold sliders
- Time window and cooldown selectors
- Test email button

## Configuration

### SMTP Setup
The system is pre-configured for the ASV internal SMTP server:
- **Host**: 172.17.50.100
- **Port**: 25
- **Authentication**: None required (internal network)

For external SMTP servers, configure in the Email Configuration panel.

### Default Thresholds
- **Instant Threshold**: 100.0 dB
- **Average Threshold**: 90.0 dB
- **Average Window**: 5 minutes
- **Cooldown Period**: 5 minutes

### Time Slot Behavior
- Alerts only trigger during configured time slots (11:30-13:30 by default)
- Lunch hour detection prevents alerts during gaps between periods
- System automatically detects current time slot using Europe/Paris timezone

## Testing

### Unit Tests

**Backend Tests**:
```bash
cd backend
pytest tests/test_email_service.py -v
pytest tests/test_statistics_service.py -v
pytest tests/test_email_alerts_api.py -v
pytest tests/test_config_api.py::test_get_config_includes_email_alerts -v
pytest tests/test_config_api.py::test_update_config_email_alerts -v
```

### Integration Testing Checklist

1. **Email Configuration**:
   - [ ] Navigate to Configuration tab
   - [ ] Enable email alerts toggle
   - [ ] Set recipient email address
   - [ ] Verify SMTP settings (172.17.50.100:25)
   - [ ] Click "Send Test Email"
   - [ ] Verify test email received

2. **Instant Threshold Alert**:
   - [ ] Set instant threshold to a low value (e.g., 70 dB)
   - [ ] Save configuration
   - [ ] Generate loud sound to exceed threshold
   - [ ] Wait for next log cycle (up to 30 seconds)
   - [ ] Verify alert email received with instant threshold details
   - [ ] Verify cooldown prevents duplicate alert

3. **Average Threshold Alert**:
   - [ ] Set average threshold to a moderate value (e.g., 65 dB)
   - [ ] Set average window to 3 minutes
   - [ ] Generate sustained moderate sound for 3+ minutes
   - [ ] Verify alert email received with average statistics
   - [ ] Verify cooldown prevents duplicate alert

4. **Time Slot Awareness**:
   - [ ] Verify alerts only trigger during configured time slots
   - [ ] Verify no alerts during lunch hours (gaps between periods)
   - [ ] Verify no alerts outside recording hours

5. **Cooldown Period**:
   - [ ] Trigger an alert
   - [ ] Immediately trigger same threshold again
   - [ ] Verify second alert is blocked (429 status in console)
   - [ ] Wait for cooldown period to expire
   - [ ] Verify new alert can be sent

## Email Content

### Instant Alert Email
**Subject**: 🚨 Sound Alert: Instant Threshold Exceeded (87.5 dB)

**Body**:
- Alert type and timestamp
- Current decibel level
- Threshold that was exceeded
- Time slot name
- Period statistics:
  - Peak level and timestamp
  - Average level
  - Zone distribution (green/yellow/red percentages)
  - Recent readings table

### Average Alert Email
**Subject**: ⚠️ Sound Alert: Average Threshold Exceeded (76.5 dB)

**Body**:
- Alert type and timestamp
- Current decibel level
- Rolling average level
- Threshold and time window
- Time slot name
- Period statistics (same as instant alert)

## Troubleshooting

### Alerts Not Being Sent

1. **Check email alerts are enabled**:
   - Go to Configuration tab
   - Verify toggle is ON (green)

2. **Verify time slot**:
   - Check current time is within a configured time slot
   - Check not during lunch hour (gap between periods)
   - Check recording status indicator is "Recording"

3. **Check thresholds**:
   - Verify thresholds are set appropriately
   - Instant threshold should be higher than typical sound levels
   - Average threshold should account for sustained levels

4. **Check cooldown**:
   - Look for cooldown messages in browser console
   - Wait for cooldown period to expire before expecting new alert

5. **Test SMTP connection**:
   - Use "Send Test Email" button
   - Check for error messages
   - Verify recipient email address is correct

### Test Email Not Received

1. **Check SMTP settings**:
   - Verify host: 172.17.50.100
   - Verify port: 25
   - Test from backend: `python -m backend.services.email_service`

2. **Check recipient email**:
   - Verify correct email address
   - Check spam folder
   - Verify email server is accepting mail

3. **Check network connectivity**:
   - Verify server can reach SMTP host (172.17.50.100)
   - Test with: `telnet 172.17.50.100 25`

### Debug Logs

**Browser Console**:
- Alert check results logged every 30 seconds
- Look for "Instant threshold alert:" or "Average threshold alert:"
- Error messages show SMTP failures or cooldown status

**Backend Logs**:
- Run with debug: `FLASK_ENV=development python app.py`
- Check for SMTP connection errors
- Verify database queries for config values

## API Reference

### Send Email Alert
```http
POST /api/email-alert
Content-Type: application/json

{
  "alert_type": "instant",
  "current_db": 87.5,
  "timestamp": "2026-02-02T11:45:00+01:00",
  "time_slot_id": 1
}
```

### Send Test Email
```http
POST /api/email-alert/test
```

### Get Configuration (includes email_alerts)
```http
GET /api/config
```

Response includes:
```json
{
  "email_alerts": {
    "enabled": true,
    "recipient": "recipient@example.com",
    "smtp_host": "172.17.50.100",
    "smtp_port": 25,
    "instant_threshold_db": 85.0,
    "average_threshold_db": 75.0,
    "average_time_window_minutes": 5,
    "cooldown_minutes": 5
  },
  // ... other config
}
```

### Update Configuration (partial updates supported)
```http
POST /api/config
Content-Type: application/json

{
  "email_alerts": {
    "enabled": true,
    "instant_threshold_db": 90.0
  }
}
```

## Security Considerations

- SMTP server is internal (172.17.50.100) - not exposed to internet
- No authentication required for internal SMTP server
- Email content includes school data but no sensitive information
- Recipient email should be configured to authorized personnel only
- Rate limiting via cooldown prevents email spam

## Future Enhancements

Potential improvements for future versions:
- Multiple recipient support (CC, BCC)
- SMTP authentication for external email servers
- SSL/TLS support for secure SMTP
- Alert history dashboard
- Alert acknowledgment system
- Custom email templates
- SMS/Slack integration as alternative alert channels
- Per-zone threshold configuration
- Scheduled summary reports
