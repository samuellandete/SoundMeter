import React, { useState, useEffect } from 'react';
import SoundMeter from './components/SoundMeter';
import ConfigPanel from './components/ConfigPanel';
import LogsViewer from './components/LogsViewer';
import ZoneSelector from './components/ZoneSelector';
import { apiService } from './services/api';

const ZONE_STORAGE_KEY = 'soundmeter_selected_zone';

function App() {
  const [config, setConfig] = useState({
    thresholds: { green_max: 60, yellow_max: 80, red_min: 80 },
    visual_update_rate: 1000,
    time_slots: [],
    zones: [],
    calibration_offset: 0
  });
  const [selectedZone, setSelectedZone] = useState(null);
  const [showZoneSelector, setShowZoneSelector] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('monitor'); // monitor, config, logs

  useEffect(() => {
    const loadConfig = async () => {
      const result = await apiService.getConfig();
      if (result.success) {
        setConfig(result.data);

        // Check for stored zone selection
        const storedZone = localStorage.getItem(ZONE_STORAGE_KEY);
        if (storedZone) {
          const parsedZone = JSON.parse(storedZone);
          // Verify the zone still exists in config
          const zoneExists = result.data.zones?.find(z => z.id === parsedZone.id);
          if (zoneExists) {
            // Update with potentially new name from config
            setSelectedZone(zoneExists);
          } else {
            // Zone no longer exists, show selector
            setShowZoneSelector(true);
          }
        } else {
          // First time, show zone selector
          setShowZoneSelector(true);
        }
      } else {
        setError('Failed to load configuration');
        console.error(result.error);
      }
      setLoading(false);
    };

    loadConfig();
  }, []);

  // Update selected zone when config changes (in case zone name was updated)
  useEffect(() => {
    if (selectedZone && config.zones?.length > 0) {
      const updatedZone = config.zones.find(z => z.id === selectedZone.id);
      if (updatedZone && updatedZone.name !== selectedZone.name) {
        setSelectedZone(updatedZone);
        localStorage.setItem(ZONE_STORAGE_KEY, JSON.stringify(updatedZone));
      }
    }
  }, [config.zones, selectedZone]);

  const handleZoneSelect = (zone) => {
    setSelectedZone(zone);
    localStorage.setItem(ZONE_STORAGE_KEY, JSON.stringify(zone));
    setShowZoneSelector(false);
  };

  const handleChangeZone = () => {
    setShowZoneSelector(true);
  };

  const handleLogSave = async (decibels) => {
    const result = await apiService.saveLog(decibels, selectedZone?.id);
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

  // Show zone selector if needed
  if (showZoneSelector && config.zones?.length > 0) {
    return (
      <ZoneSelector
        zones={config.zones}
        onZoneSelect={handleZoneSelect}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-5xl font-bold text-gray-800 text-center mb-4">
          Sound Meter
        </h1>

        {/* Zone Indicator */}
        {selectedZone && (
          <div className="flex justify-center mb-6">
            <div className="bg-white rounded-lg shadow px-4 py-2 flex items-center gap-3">
              <span className="text-gray-600">Zone:</span>
              <span className="font-semibold text-blue-600">{selectedZone.name}</span>
              <button
                onClick={handleChangeZone}
                className="text-sm text-gray-500 hover:text-blue-500 underline ml-2"
              >
                Change
              </button>
            </div>
          </div>
        )}

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
            <LogsViewer config={config} />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
