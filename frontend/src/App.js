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
