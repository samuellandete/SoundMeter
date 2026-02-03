import React, { useState, useEffect, useMemo } from 'react';
import { apiService } from '../services/api';
import {
  TrendsAverageChart,
  TrendsPeakChart,
  TrendsZoneTimeChart,
  TrendLineChart,
  TrendsMultiSeriesChart
} from './charts/TrendsCharts';

const TrendsView = ({ config }) => {
  // Granularity: day, week, month
  const [granularity, setGranularity] = useState('day');

  // Date range
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Filters
  const [selectedZone, setSelectedZone] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [compareMode, setCompareMode] = useState('single'); // single, allSlots, allZones

  // Data
  const [trendsData, setTrendsData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Active chart
  const [activeChart, setActiveChart] = useState('average');

  // Initialize zone and slot from config
  useEffect(() => {
    if (config.zones?.length > 0 && selectedZone === null) {
      setSelectedZone(config.zones[0].id);
    }
    if (config.time_slots?.length > 0 && selectedSlot === null) {
      setSelectedSlot(config.time_slots[0].id);
    }
  }, [config, selectedZone, selectedSlot]);

  // Load data when filters change
  useEffect(() => {
    if (startDate && endDate) {
      loadTrends();
    }
  }, [granularity, startDate, endDate]);

  const loadTrends = async () => {
    setLoading(true);
    const result = await apiService.getTrends(granularity, startDate, endDate);
    if (result.success) {
      setTrendsData(result.data);
    }
    setLoading(false);
  };

  // Preset handlers
  const applyPreset = (preset) => {
    const today = new Date();
    let start;

    switch (preset) {
      case 'last7days':
        start = new Date(today);
        start.setDate(start.getDate() - 6);
        setGranularity('day');
        break;
      case 'last4weeks':
        start = new Date(today);
        start.setDate(start.getDate() - 27);
        setGranularity('week');
        break;
      case 'last3months':
        start = new Date(today);
        start.setMonth(start.getMonth() - 2);
        start.setDate(1);
        setGranularity('month');
        break;
      default:
        return;
    }

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(today.toISOString().split('T')[0]);
  };

  // Available zones and slots from data
  const availableZones = useMemo(() => {
    if (!trendsData?.periods?.length) return [];
    const zoneIds = new Set();
    trendsData.periods.forEach(p => p.data.forEach(d => zoneIds.add(d.zone_id)));
    return config.zones?.filter(z => zoneIds.has(z.id)) || [];
  }, [trendsData, config.zones]);

  const availableSlots = useMemo(() => {
    if (!trendsData?.periods?.length) return [];
    const slotIds = new Set();
    trendsData.periods.forEach(p => p.data.forEach(d => slotIds.add(d.slot_id)));
    return config.time_slots?.filter(s => slotIds.has(s.id)) || [];
  }, [trendsData, config.time_slots]);

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-6xl w-full">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Trends</h2>

      {/* Granularity Tabs */}
      <div className="flex gap-2 mb-6">
        {['day', 'week', 'month'].map(g => (
          <button
            key={g}
            onClick={() => setGranularity(g)}
            className={`px-6 py-2 rounded-lg font-medium capitalize ${
              granularity === g
                ? 'bg-asv-blue text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Presets and Date Range */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => applyPreset('last7days')}
            className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
          >
            Last 7 Days
          </button>
          <button
            onClick={() => applyPreset('last4weeks')}
            className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
          >
            Last 4 Weeks
          </button>
          <button
            onClick={() => applyPreset('last3months')}
            className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
          >
            Last 3 Months
          </button>
        </div>

        <div className="flex flex-wrap gap-4 items-center">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Zone and Slot Selection */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Zone</label>
          <select
            value={selectedZone || ''}
            onChange={(e) => setSelectedZone(Number(e.target.value))}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
          >
            {availableZones.map(zone => (
              <option key={zone.id} value={zone.id}>{zone.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Time Period</label>
          <select
            value={selectedSlot || ''}
            onChange={(e) => setSelectedSlot(Number(e.target.value))}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
          >
            {availableSlots.map(slot => (
              <option key={slot.id} value={slot.id}>{slot.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Compare Mode</label>
          <select
            value={compareMode}
            onChange={(e) => setCompareMode(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
          >
            <option value="single">Single Zone & Period</option>
            <option value="allSlots">All Periods (same zone)</option>
            <option value="allZones">All Zones (same period)</option>
          </select>
        </div>
      </div>

      {/* Chart Type Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {[
          { key: 'average', label: 'Average' },
          { key: 'peak', label: 'Peak' },
          { key: 'zonetime', label: 'Zone Time %' },
          { key: 'trend', label: 'Trend Line' }
        ].map(chart => (
          <button
            key={chart.key}
            onClick={() => setActiveChart(chart.key)}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap ${
              activeChart === chart.key
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {chart.label}
          </button>
        ))}
      </div>

      {/* Chart Display */}
      <div className="bg-gray-50 rounded-lg p-4">
        {loading ? (
          <div className="text-center py-20 text-gray-600">Loading data...</div>
        ) : !trendsData?.periods?.length ? (
          <div className="text-center py-20 text-gray-600">
            No data available for the selected date range
          </div>
        ) : compareMode !== 'single' ? (
          <TrendsMultiSeriesChart
            trendsData={trendsData}
            mode={compareMode}
            selectedZone={selectedZone}
            selectedSlot={selectedSlot}
            config={config}
          />
        ) : (
          <>
            {activeChart === 'average' && (
              <TrendsAverageChart
                trendsData={trendsData}
                selectedZone={selectedZone}
                selectedSlot={selectedSlot}
              />
            )}
            {activeChart === 'peak' && (
              <TrendsPeakChart
                trendsData={trendsData}
                selectedZone={selectedZone}
                selectedSlot={selectedSlot}
              />
            )}
            {activeChart === 'zonetime' && (
              <TrendsZoneTimeChart
                trendsData={trendsData}
                selectedZone={selectedZone}
                selectedSlot={selectedSlot}
              />
            )}
            {activeChart === 'trend' && (
              <TrendLineChart
                trendsData={trendsData}
                selectedZone={selectedZone}
                selectedSlot={selectedSlot}
              />
            )}
          </>
        )}
      </div>

      {/* Data Summary */}
      {trendsData?.periods?.length > 0 && (
        <div className="mt-6 bg-blue-50 rounded-lg p-4">
          <p className="text-sm text-gray-700">
            Showing <strong>{trendsData.periods.length}</strong> {granularity}(s) of data
          </p>
        </div>
      )}
    </div>
  );
};

export default TrendsView;
