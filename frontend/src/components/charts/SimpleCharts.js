import React from 'react';
import { Line, Bar } from 'react-chartjs-2';

// Color palettes
const slotColors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b'];
const zoneColors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];

// Line Overlay Chart
export const LineOverlay = ({ logsData, thresholds, compareZones = false }) => {
  if (!logsData || logsData.length === 0) {
    return <div className="text-gray-600 text-center py-8">No data available</div>;
  }

  const groupedLogs = {};

  if (compareZones) {
    // Group by zone
    logsData.forEach(log => {
      const key = log.zone_id || 'unknown';
      if (!groupedLogs[key]) {
        groupedLogs[key] = { name: log.zone_name || 'Unknown Zone', data: [] };
      }
      const timestamp = new Date(log.timestamp);
      const minutes = timestamp.getMinutes() % 30 + timestamp.getSeconds() / 60;
      groupedLogs[key].data.push({ x: minutes, y: log.decibels });
    });
  } else {
    // Group by time slot (default)
    logsData.forEach(log => {
      if (!groupedLogs[log.time_slot_id]) {
        groupedLogs[log.time_slot_id] = { name: log.slot_name, data: [] };
      }
      const timestamp = new Date(log.timestamp);
      const minutes = timestamp.getMinutes() % 30 + timestamp.getSeconds() / 60;
      groupedLogs[log.time_slot_id].data.push({ x: minutes, y: log.decibels });
    });
  }

  const colors = compareZones ? zoneColors : slotColors;
  const datasets = Object.entries(groupedLogs).map(([key, group], index) => ({
    label: group.name,
    data: group.data.sort((a, b) => a.x - b.x),
    borderColor: colors[index % colors.length],
    backgroundColor: colors[index % colors.length] + '20',
    tension: 0.3,
  }));

  const data = { datasets };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { type: 'linear', min: 0, max: 30, title: { display: true, text: 'Minutes into period' }},
      y: { min: 0, max: 100, title: { display: true, text: 'Decibels (dB)' }}
    },
    plugins: {
      legend: { position: 'top' },
      title: {
        display: true,
        text: compareZones ? 'Sound Levels by Zone' : 'Sound Levels Over Time',
        font: { size: 18 }
      }
    }
  };

  return <div style={{ height: '400px' }}><Line data={data} options={options} /></div>;
};

// Average Bar Chart
export const AverageBar = ({ logsData, thresholds, compareZones = false }) => {
  if (!logsData || logsData.length === 0) {
    return <div className="text-gray-600 text-center py-8">No data available</div>;
  }

  const groupAverages = {};

  if (compareZones) {
    // Group by zone
    logsData.forEach(log => {
      const key = log.zone_id || 'unknown';
      if (!groupAverages[key]) {
        groupAverages[key] = { name: log.zone_name || 'Unknown Zone', total: 0, count: 0 };
      }
      groupAverages[key].total += log.decibels;
      groupAverages[key].count += 1;
    });
  } else {
    // Group by time slot
    logsData.forEach(log => {
      if (!groupAverages[log.time_slot_id]) {
        groupAverages[log.time_slot_id] = { name: log.slot_name, total: 0, count: 0 };
      }
      groupAverages[log.time_slot_id].total += log.decibels;
      groupAverages[log.time_slot_id].count += 1;
    });
  }

  const labels = [];
  const averages = [];
  const colors = [];

  Object.values(groupAverages).forEach(group => {
    const avg = group.total / group.count;
    labels.push(group.name);
    averages.push(avg);
    colors.push(avg <= thresholds.orange_threshold ? '#22c55e' : avg <= thresholds.red_threshold ? '#f97316' : '#ef4444');
  });

  const data = { labels, datasets: [{ label: 'Average Decibels', data: averages, backgroundColor: colors }]};
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: { y: { min: 0, max: 100, title: { display: true, text: 'Decibels (dB)' }}},
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: compareZones ? 'Average Sound Level by Zone' : 'Average Sound Level by Period',
        font: { size: 18 }
      }
    }
  };

  return <div style={{ height: '400px' }}><Bar data={data} options={options} /></div>;
};

// Peak Comparison Chart
export const PeakComparison = ({ logsData, thresholds, compareZones = false }) => {
  if (!logsData || logsData.length === 0) {
    return <div className="text-gray-600 text-center py-8">No data available</div>;
  }

  const groupPeaks = {};

  if (compareZones) {
    // Group by zone
    logsData.forEach(log => {
      const key = log.zone_id || 'unknown';
      if (!groupPeaks[key] || log.decibels > groupPeaks[key].peak) {
        groupPeaks[key] = { name: log.zone_name || 'Unknown Zone', peak: log.decibels, timestamp: log.timestamp };
      }
    });
  } else {
    // Group by time slot
    logsData.forEach(log => {
      if (!groupPeaks[log.time_slot_id] || log.decibels > groupPeaks[log.time_slot_id].peak) {
        groupPeaks[log.time_slot_id] = { name: log.slot_name, peak: log.decibels, timestamp: log.timestamp };
      }
    });
  }

  const labels = [];
  const peaks = [];
  const colors = [];

  Object.values(groupPeaks).forEach(group => {
    labels.push(group.name);
    peaks.push(group.peak);
    colors.push(group.peak <= thresholds.orange_threshold ? '#22c55e' : group.peak <= thresholds.red_threshold ? '#f97316' : '#ef4444');
  });

  const data = { labels, datasets: [{ label: 'Peak Decibels', data: peaks, backgroundColor: colors }]};
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: { y: { min: 0, max: 100, title: { display: true, text: 'Decibels (dB)' }}},
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: compareZones ? 'Peak Noise Level by Zone' : 'Peak Noise Level by Period',
        font: { size: 18 }
      }
    }
  };

  return <div style={{ height: '400px' }}><Bar data={data} options={options} /></div>;
};

// Zone Percentage Chart (renamed internally to avoid confusion with location zones)
export const ZonePercentage = ({ logsData, thresholds, compareZones = false }) => {
  if (!logsData || logsData.length === 0) {
    return <div className="text-gray-600 text-center py-8">No data available</div>;
  }

  const groupZones = {};

  if (compareZones) {
    // Group by location zone
    logsData.forEach(log => {
      const key = log.zone_id || 'unknown';
      if (!groupZones[key]) {
        groupZones[key] = { name: log.zone_name || 'Unknown Zone', green: 0, orange: 0, red: 0, total: 0 };
      }
      const group = groupZones[key];
      group.total += 1;
      if (log.decibels <= thresholds.orange_threshold) group.green += 1;
      else if (log.decibels <= thresholds.red_threshold) group.orange += 1;
      else group.red += 1;
    });
  } else {
    // Group by time slot
    logsData.forEach(log => {
      if (!groupZones[log.time_slot_id]) {
        groupZones[log.time_slot_id] = { name: log.slot_name, green: 0, orange: 0, red: 0, total: 0 };
      }
      const group = groupZones[log.time_slot_id];
      group.total += 1;
      if (log.decibels <= thresholds.orange_threshold) group.green += 1;
      else if (log.decibels <= thresholds.red_threshold) group.orange += 1;
      else group.red += 1;
    });
  }

  const labels = [];
  const greenPercentages = [];
  const orangePercentages = [];
  const redPercentages = [];

  Object.values(groupZones).forEach(group => {
    labels.push(group.name);
    greenPercentages.push((group.green / group.total * 100).toFixed(1));
    orangePercentages.push((group.orange / group.total * 100).toFixed(1));
    redPercentages.push((group.red / group.total * 100).toFixed(1));
  });

  const data = {
    labels,
    datasets: [
      { label: 'Quiet (Green)', data: greenPercentages, backgroundColor: '#22c55e' },
      { label: 'Moderate (Orange)', data: orangePercentages, backgroundColor: '#f97316' },
      { label: 'Too Loud (Red)', data: redPercentages, backgroundColor: '#ef4444' }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: { x: { stacked: true }, y: { stacked: true, min: 0, max: 100, title: { display: true, text: 'Percentage (%)' }}},
    plugins: {
      legend: { position: 'top' },
      title: {
        display: true,
        text: compareZones ? 'Time in Each Noise Level by Zone' : 'Time in Each Noise Level by Period',
        font: { size: 18 }
      }
    }
  };

  return <div style={{ height: '400px' }}><Bar data={data} options={options} /></div>;
};
