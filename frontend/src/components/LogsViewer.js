import React, { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import { LineOverlay, AverageBar, PeakComparison, ZonePercentage } from './charts/SimpleCharts';

const LogsViewer = ({ config }) => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedSlots, setSelectedSlots] = useState([1, 2, 3, 4]);
  const [selectedZones, setSelectedZones] = useState([]); // Empty means all zones
  const [compareMode, setCompareMode] = useState(false);
  const [logsData, setLogsData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeChart, setActiveChart] = useState('overlay');

  // Initialize selectedZones when config loads
  useEffect(() => {
    if (config.zones?.length > 0 && selectedZones.length === 0) {
      // Default to all zones selected
      setSelectedZones(config.zones.map(z => z.id));
    }
  }, [config.zones]);

  useEffect(() => {
    loadLogs();
  }, [selectedDate, selectedSlots, selectedZones]);

  const loadLogs = async () => {
    setLoading(true);
    const zonesToFetch = selectedZones.length > 0 ? selectedZones : null;
    const result = await apiService.getLogs(selectedDate, selectedSlots, zonesToFetch);
    if (result.success) {
      setLogsData(result.data);
    }
    setLoading(false);
  };

  const handleSlotToggle = (slotId) => {
    setSelectedSlots(prev =>
      prev.includes(slotId) ? prev.filter(id => id !== slotId) : [...prev, slotId]
    );
  };

  const handleZoneToggle = (zoneId) => {
    setSelectedZones(prev =>
      prev.includes(zoneId) ? prev.filter(id => id !== zoneId) : [...prev, zoneId]
    );
  };

  const handleExport = async () => {
    const zonesToExport = selectedZones.length > 0 ? selectedZones : null;
    await apiService.exportCSV(selectedDate, selectedSlots, zonesToExport);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-6xl w-full">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Logs Viewer</h2>

      {/* Date, Slot, and Zone Selection */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Select Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Select Time Periods</label>
          <div className="space-y-2">
            {config.time_slots.map(slot => (
              <label key={slot.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedSlots.includes(slot.id)}
                  onChange={() => handleSlotToggle(slot.id)}
                  className="w-5 h-5 text-blue-500 rounded"
                />
                <span className="text-sm text-gray-700">
                  {slot.name} ({slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)})
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Select Zones</label>
          <div className="space-y-2">
            {config.zones?.map(zone => (
              <label key={zone.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedZones.includes(zone.id)}
                  onChange={() => handleZoneToggle(zone.id)}
                  className="w-5 h-5 text-blue-500 rounded"
                />
                <span className="text-sm text-gray-700">{zone.name}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Compare Mode Toggle and Export */}
      <div className="mb-6 flex items-center gap-6">
        <button
          onClick={handleExport}
          className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-lg transition-colors"
        >
          Export to CSV
        </button>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={compareMode}
            onChange={(e) => setCompareMode(e.target.checked)}
            className="w-5 h-5 text-purple-500 rounded"
          />
          <span className="text-sm font-medium text-gray-700">Compare zones on same chart</span>
        </label>
      </div>

      {/* Chart Type Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {['overlay', 'average', 'peak', 'zones'].map(chart => (
          <button
            key={chart}
            onClick={() => setActiveChart(chart)}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap ${
              activeChart === chart ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {chart === 'overlay' && 'Line Overlay'}
            {chart === 'average' && 'Average Comparison'}
            {chart === 'peak' && 'Peak Noise'}
            {chart === 'zones' && 'Zone Percentages'}
          </button>
        ))}
      </div>

      {/* Chart Display */}
      <div className="bg-gray-50 rounded-lg p-4">
        {loading ? (
          <div className="text-center py-20 text-gray-600">Loading data...</div>
        ) : logsData.length === 0 ? (
          <div className="text-center py-20 text-gray-600">
            No data available for selected date, time periods, and zones
          </div>
        ) : (
          <>
            {activeChart === 'overlay' && <LineOverlay logsData={logsData} thresholds={config.thresholds} compareZones={compareMode} />}
            {activeChart === 'average' && <AverageBar logsData={logsData} thresholds={config.thresholds} compareZones={compareMode} />}
            {activeChart === 'peak' && <PeakComparison logsData={logsData} thresholds={config.thresholds} compareZones={compareMode} />}
            {activeChart === 'zones' && <ZonePercentage logsData={logsData} thresholds={config.thresholds} compareZones={compareMode} />}
          </>
        )}
      </div>

      {/* Data Summary */}
      {logsData.length > 0 && (
        <div className="mt-6 bg-blue-50 rounded-lg p-4">
          <p className="text-sm text-gray-700">
            <strong>{logsData.length}</strong> log entries for <strong>{selectedSlots.length}</strong> time period(s)
          </p>
        </div>
      )}
    </div>
  );
};

export default LogsViewer;
