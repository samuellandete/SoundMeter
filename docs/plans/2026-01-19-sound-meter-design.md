# Sound Meter Web App - Design Document

**Date:** 2026-01-19
**Purpose:** iPad web application for monitoring dining hall sound levels during lunch period

## Overview

A real-time sound monitoring application optimized for iPad that displays traffic light-style visual feedback, records sound levels every 30 seconds during lunch hours (11:30-13:30 CET), and provides comprehensive analysis through multiple visualization types.

## Requirements Summary

- Real-time sound level display with traffic light color coding (green/yellow/red)
- Configurable decibel thresholds for each traffic light zone
- Visual updates every 0.5-1 second (configurable)
- Log recording every 30 seconds to database
- Recording only during 11:30-13:30 CET lunch period
- Four 30-minute time slots with customizable names
- CSV export of all logs with timestamp and decibel readings
- Multiple chart types for data analysis and comparison
- Backend server with database for persistent storage

## System Architecture

### Three-Layer Architecture

1. **Frontend (React)** - iPad-optimized web interface
   - Real-time sound meter display with traffic light visualization
   - Configuration panel for threshold adjustments and time slot naming
   - Logs viewer with multiple chart types
   - CSV export functionality

2. **Backend (Python/Flask)** - REST API
   - Sound log recording endpoints
   - Configuration management (thresholds, time slot names)
   - Data retrieval for visualization
   - CSV generation
   - Time zone handling (CET)

3. **Database (SQLite)** - File-based storage
   - `sound_logs` table (timestamp, decibels, time_slot_id)
   - `time_slots` table (id, start_time, end_time, name)
   - `config` table (key-value pairs for thresholds and settings)

### Data Flow

1. iPad microphone → Web Audio API → measures decibel level
2. Visual updates at configurable rate (0.5s or 1s)
3. Every 30 seconds: POST request to backend with timestamp + dB reading
4. Backend validates time (11:30-13:30 CET) and stores in SQLite
5. Graphs fetch data via GET requests filtered by date and time slot
6. CSV export generates file from database on-demand

## Frontend Design

### Main Components

#### 1. SoundMeter Component (Main Display)
- Large traffic light circle showing current sound level (green/yellow/red)
- Current decibel reading displayed in large text
- Visual update rate selector (0.5s / 1s toggle in settings)
- Recording status indicator (active during 11:30-13:30 CET)
- Countdown timer showing seconds until next 30s log

#### 2. Configuration Panel
- **Threshold Sliders:**
  - Green max: default 60dB
  - Yellow range: default 60-80dB
  - Red min: default >80dB

- **Time Slot Naming:**
  - "11:30-12:00": [text input for permanent name]
  - "12:00-12:30": [text input for permanent name]
  - "12:30-13:00": [text input for permanent name]
  - "13:00-13:30": [text input for permanent name]

- **Visual Update Rate:** dropdown (0.5s / 1s)

#### 3. Logs Viewer Component
- Date picker to select which day's data to view
- Time slot selector (checkboxes for the 4 periods)
- Four visualization tabs:
  - Line graph overlay (multiple periods on same chart)
  - Average dB bar chart comparison
  - Peak noise comparison
  - Traffic light zone percentage breakdown
- Export CSV button

### Audio Processing
- Web Audio API's AnalyserNode for frequency data
- Calculate RMS (root mean square) and convert to decibels
- Visual updates on configurable interval (500ms or 1000ms)
- Every 30 seconds, send current reading to backend

## Backend API Design

### REST API Endpoints

```
POST /api/logs
Body: { timestamp: "ISO8601", decibels: float }
- Validates timestamp is within 11:30-13:30 CET
- Determines time_slot_id based on time
- Returns: { success: bool, message: string }

GET /api/logs?date=YYYY-MM-DD&slots=1,2,3,4
- Returns sound logs for specified date and time slots
- Response: [{ id, timestamp, decibels, slot_name }, ...]

GET /api/config
- Returns current configuration
- Response: {
    thresholds: {green_max, yellow_max, red_min},
    visual_update_rate: 500,
    time_slots: [{id, start, end, name}, ...]
  }

POST /api/config
- Updates thresholds, visual rate, or time slot names
- Body: partial config object
- Returns updated full config

GET /api/export?date=YYYY-MM-DD&slots=1,2,3,4
- Generates and downloads CSV file
- Columns: timestamp, decibels, time_slot_name
```

### Database Schema

```sql
CREATE TABLE time_slots (
    id INTEGER PRIMARY KEY,
    start_time TEXT,  -- "11:30:00"
    end_time TEXT,    -- "12:00:00"
    name TEXT         -- "First Seating" (permanent label)
);

CREATE TABLE sound_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME,
    decibels REAL,
    time_slot_id INTEGER,
    FOREIGN KEY (time_slot_id) REFERENCES time_slots(id)
);

CREATE TABLE config (
    key TEXT PRIMARY KEY,
    value TEXT  -- JSON-encoded values
);
```

### Time Zone Handling
- Backend converts all incoming timestamps to CET
- Uses Python's `pytz` library for timezone conversions
- Validates that recording time is within lunch period
- Rejects logs outside 11:30-13:30 window

## Data Visualization

### Chart Library
- Chart.js or Recharts (React-friendly)
- Responsive design optimized for iPad landscape/portrait modes

### Visualization Types

#### 1. Line Graph Overlay
- **X-axis:** Time within 30-min period (0-30 minutes)
- **Y-axis:** Decibels (0-100dB range)
- Each selected time slot = different colored line
- Horizontal lines showing threshold boundaries (green/yellow/red)
- Legend showing which color = which time slot name
- Hoverable tooltips with exact timestamp + dB value

#### 2. Average Decibel Bar Chart
- **X-axis:** Time slot names
- **Y-axis:** Average decibels
- Bars colored based on which zone the average falls into
- Shows exact average value on top of each bar

#### 3. Peak Noise Comparison
- Bar chart showing maximum dB reached in each period
- Includes timestamp of when peak occurred (in tooltip)
- Bars colored by severity

#### 4. Traffic Light Zone Percentage
- Stacked horizontal bar chart (or pie chart option)
- Shows % of time in green/yellow/red for each selected period
- Green/yellow/red color coding
- Percentages calculated from 30s log intervals

### Analysis Logic
- Backend calculates aggregates (avg, max, min, percentages) on-the-fly
- Groups logs by time_slot_id for comparisons
- Normalizes time within each 30-min period for overlay alignment

## Error Handling

### Microphone Access
- Prompt user for microphone permission on first load
- Clear error message if denied with Safari settings instructions
- Fallback UI if Web Audio API not supported

### Recording Window Validation
- Frontend shows countdown timer until lunch period starts
- During 11:30-13:30: green "Recording" indicator
- Outside hours: gray "Stopped" indicator
- Backend rejects logs outside time window with error message

### Network Issues
- Queue failed log submissions in localStorage
- Retry on reconnection
- Connection status indicator on UI
- Toast notifications for sync errors

### Data Integrity
- Backend validates decibel readings (0-120dB range)
- Duplicate timestamp detection (ignore if same minute)
- Database constraints prevent orphaned records

## iPad Optimization

- Responsive CSS with `@media` queries for iPad dimensions
- Large touch targets (min 44x44px for buttons)
- Prevent iPad sleep during recording hours (wakeLock API or keep-alive ping)
- PWA (Progressive Web App) configuration for "Add to Home Screen"
- Landscape orientation optimized (traffic light on left, controls on right)
- Dark mode support to reduce eye strain

## Technology Stack

### Frontend
- React 18
- Chart.js for visualizations
- TailwindCSS for styling
- Web Audio API for microphone access

### Backend
- Python 3.10+
- Flask web framework
- SQLite3 database
- pytz for timezone handling

### Deployment Options
- **Backend:**
  - Local network (Raspberry Pi on school WiFi)
  - Cloud hosting (PythonAnywhere, Heroku, Railway.app)
- **Frontend:** Served as static files from Flask or separate CDN
- **Database:** SQLite file stored alongside Flask app
- **Configuration:** Environment variables for CET timezone

## Initial Configuration

### Default Thresholds
- Green: < 60dB
- Yellow: 60-80dB
- Red: > 80dB

### Time Slots (Default Names)
1. 11:30-12:00: "Period 1"
2. 12:00-12:30: "Period 2"
3. 12:30-13:00: "Period 3"
4. 13:00-13:30: "Period 4"

### Visual Update Rate
- Default: 1000ms (1 second)
- Options: 500ms or 1000ms

## Success Criteria

- Traffic light responds to sound changes within visual update interval
- Logs recorded accurately every 30 seconds during lunch hours
- All four visualization types display data correctly
- CSV export contains all requested data with proper formatting
- Thresholds and time slot names persist across sessions
- iPad can run app continuously during lunch period without crashes
- Charts allow comparison of multiple time periods simultaneously
