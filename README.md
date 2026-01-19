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
