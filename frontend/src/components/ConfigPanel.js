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
              Orange Threshold: {localConfig.thresholds.orange_threshold} dB (green if below)
            </label>
            <input
              type="range"
              min="30"
              max="80"
              value={localConfig.thresholds.orange_threshold}
              onChange={(e) => handleThresholdChange('orange_threshold', e.target.value)}
              className="w-full h-2 bg-traffic-orange rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">
              Red Threshold: {localConfig.thresholds.red_threshold} dB (orange if below)
            </label>
            <input
              type="range"
              min="50"
              max="100"
              value={localConfig.thresholds.red_threshold}
              onChange={(e) => handleThresholdChange('red_threshold', e.target.value)}
              className="w-full h-2 bg-traffic-red rounded-lg appearance-none cursor-pointer"
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
