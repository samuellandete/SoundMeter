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
