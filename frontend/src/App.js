import React, { useState } from 'react';
import SoundMeter from './components/SoundMeter';

function App() {
  const [config] = useState({
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
