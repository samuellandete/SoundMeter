import React, { useState, useEffect, useRef } from 'react';
import { apiService } from '../services/api';
import AudioProcessor from '../utils/audioProcessor';
import EmailConfigPanel from './EmailConfigPanel';

const CALIBRATION_KEY = (zoneId) => `soundmeter_calibration_zone_${zoneId}`;

const ConfigPanel = ({ config, onConfigUpdate }) => {
  const [localConfig, setLocalConfig] = useState({ ...config });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // Per-zone calibration (stored in localStorage on each measuring device)
  const [calibrationZoneId, setCalibrationZoneId] = useState(null);
  const [calibrationValue, setCalibrationValue] = useState(0);

  // Storage info state
  const [storageInfo, setStorageInfo] = useState(null);
  const [deleteMonths, setDeleteMonths] = useState(13);
  const [deleteMessage, setDeleteMessage] = useState(null);

  // Sync localConfig when config prop changes
  useEffect(() => {
    const { calibration_offset: _ignored, ...rest } = config;
    setLocalConfig(prev => ({ ...prev, ...rest }));
  }, [config]);

  // Initialize calibration zone to first available zone
  useEffect(() => {
    if (localConfig.zones?.length > 0 && calibrationZoneId === null) {
      const firstId = localConfig.zones[0].id;
      setCalibrationZoneId(firstId);
      const stored = localStorage.getItem(CALIBRATION_KEY(firstId));
      setCalibrationValue(stored !== null ? parseFloat(stored) : 0);
    }
  }, [localConfig.zones, calibrationZoneId]);

  const handleCalibrationZoneChange = (zoneId) => {
    const id = Number(zoneId);
    setCalibrationZoneId(id);
    const stored = localStorage.getItem(CALIBRATION_KEY(id));
    setCalibrationValue(stored !== null ? parseFloat(stored) : 0);
  };

  // Calibration state
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [currentReading, setCurrentReading] = useState(0);
  const [targetDb, setTargetDb] = useState(30);
  const audioProcessorRef = useRef(null);
  const intervalRef = useRef(null);

  // Start calibration mode - capture live audio
  const startCalibration = async () => {
    const processor = new AudioProcessor();
    const result = await processor.initialize();
    if (result.success) {
      audioProcessorRef.current = processor;
      setIsCalibrating(true);
      // Update reading every 500ms
      intervalRef.current = setInterval(() => {
        const db = processor.getDecibels();
        setCurrentReading(Math.round(db));
      }, 500);
    }
  };

  // Stop calibration and apply offset — stored per zone in localStorage
  const applyCalibration = () => {
    const offset = targetDb - currentReading;
    if (calibrationZoneId !== null) {
      localStorage.setItem(CALIBRATION_KEY(calibrationZoneId), offset.toString());
    }
    setCalibrationValue(offset);
    stopCalibration();
  };

  // Cancel calibration
  const stopCalibration = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    if (audioProcessorRef.current) {
      audioProcessorRef.current.stop();
    }
    setIsCalibrating(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => stopCalibration();
  }, []);

  // Load storage info on mount and after delete
  const loadStorageInfo = async () => {
    const result = await apiService.getStorageInfo();
    if (result.success) {
      setStorageInfo(result.data);
    }
  };

  useEffect(() => {
    loadStorageInfo();
  }, []);

  // Handle delete old logs
  const handleDeleteOldLogs = async () => {
    if (!window.confirm(`Are you sure you want to delete all logs older than ${deleteMonths} month(s)? This action cannot be undone.`)) {
      return;
    }

    const result = await apiService.deleteOldLogs(deleteMonths);
    if (result.success) {
      setDeleteMessage(result.data.message);
      // Reload storage info to reflect changes
      loadStorageInfo();
    } else {
      setDeleteMessage(`Error: ${result.error}`);
    }

    // Clear message after 5 seconds
    setTimeout(() => setDeleteMessage(null), 5000);
  };

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

  const handleZoneNameChange = (zoneId, name) => {
    setLocalConfig(prev => ({
      ...prev,
      zones: prev.zones.map(zone =>
        zone.id === zoneId ? { ...zone, name } : zone
      )
    }));
  };

  const handleUpdateRateChange = (rate) => {
    setLocalConfig(prev => ({
      ...prev,
      visual_update_rate: parseInt(rate)
    }));
  };

  const handleEmailConfigChange = (emailConfig) => {
    setLocalConfig(prev => ({
      ...prev,
      email_alerts: emailConfig
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage('');
    // calibration is stored locally per zone — never sent to the backend
    const { calibration_offset: _omit, ...configToSave } = localConfig;
    const result = await apiService.updateConfig(configToSave);
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
              max="130"
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
              max="130"
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

      {/* Microphone Calibration — stored locally per zone on each measuring device */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">Microphone Calibration</h3>
        <p className="text-xs text-gray-500 mb-3">
          Calibration is stored on this device per zone. Set it on each measuring iPad individually.
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-600 mb-1">Zone to calibrate</label>
          <select
            value={calibrationZoneId || ''}
            onChange={(e) => handleCalibrationZoneChange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {localConfig.zones?.map(z => (
              <option key={z.id} value={z.id}>{z.name}</option>
            ))}
          </select>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Current offset: <span className="font-mono font-bold">{calibrationValue} dB</span>
        </p>

        {!isCalibrating ? (
          <button
            onClick={startCalibration}
            className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
          >
            Start Calibration
          </button>
        ) : (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-3">
              Current raw reading: <span className="font-mono font-bold text-2xl">{currentReading} dB</span>
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-600 mb-2">
                This should actually be:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={targetDb}
                  onChange={(e) => setTargetDb(parseInt(e.target.value) || 0)}
                  className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <span className="text-gray-600">dB</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Quiet room: ~30 dB, Normal conversation: ~60 dB
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={applyCalibration}
                className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
              >
                Apply ({targetDb - currentReading > 0 ? '+' : ''}{targetDb - currentReading} dB)
              </button>
              <button
                onClick={stopCalibration}
                className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <button
          onClick={() => {
            if (calibrationZoneId !== null) {
              localStorage.setItem(CALIBRATION_KEY(calibrationZoneId), '0');
              setCalibrationValue(0);
            }
          }}
          className="mt-3 text-sm text-gray-500 hover:text-gray-700 underline"
        >
          Reset calibration to 0
        </button>
      </div>

      {/* Zone Names */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">Zone Names</h3>
        <p className="text-sm text-gray-500 mb-3">
          Configure names for the 5 monitoring zones (e.g., location names)
        </p>
        <div className="space-y-3">
          {localConfig.zones?.map(zone => (
            <div key={zone.id} className="flex items-center gap-3">
              <span className="text-sm text-gray-600 w-16">Zone {zone.id}</span>
              <input
                type="text"
                value={zone.name}
                onChange={(e) => handleZoneNameChange(zone.id, e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={`Zone ${zone.id}`}
              />
            </div>
          ))}
        </div>
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

      {/* Email Configuration */}
      {localConfig.email_alerts && (
        <EmailConfigPanel
          emailConfig={localConfig.email_alerts}
          onChange={handleEmailConfigChange}
        />
      )}

      {/* Save Button */}
      <div className="flex items-center gap-4 mb-8">
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

      {/* Storage Info and Data Management */}
      <div className="border-t border-gray-200 pt-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">Storage & Data Management</h3>

        {/* Storage Info */}
        {storageInfo && (
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Database size:</span>
                <span className="ml-2 font-mono font-bold">
                  {storageInfo.database_size_mb < 1
                    ? `${storageInfo.database_size_bytes} bytes`
                    : `${storageInfo.database_size_mb} MB`}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Disk space available:</span>
                <span className="ml-2 font-mono font-bold">
                  {storageInfo.disk_free_gb} GB ({storageInfo.disk_free_percent}%)
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Delete Old Logs */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-gray-600">Delete logs older than:</label>
          <select
            value={deleteMonths}
            onChange={(e) => setDeleteMonths(parseInt(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            {[...Array(13)].map((_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1} month{i + 1 > 1 ? 's' : ''}
              </option>
            ))}
          </select>
          <button
            onClick={handleDeleteOldLogs}
            className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
          >
            Delete Old Logs
          </button>
        </div>

        {/* Delete Message */}
        {deleteMessage && (
          <div className={`mt-3 p-3 rounded-lg text-sm ${deleteMessage.startsWith('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {deleteMessage}
          </div>
        )}
      </div>
    </div>
  );
};

export default ConfigPanel;
