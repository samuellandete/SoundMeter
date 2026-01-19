import React from 'react';
import { Line, Bar } from 'react-chartjs-2';

// Line Overlay Chart
export const LineOverlay = ({ logsData, thresholds }) => {
  if (!logsData || logsData.length === 0) {
    return <div className="text-gray-600 text-center py-8">No data available</div>;
  }

  const groupedLogs = {};
  logsData.forEach(log => {
    if (!groupedLogs[log.time_slot_id]) {
      groupedLogs[log.time_slot_id] = { name: log.slot_name, data: [] };
    }
    const timestamp = new Date(log.timestamp);
    const minutes = timestamp.getMinutes() % 30 + timestamp.getSeconds() / 60;
    groupedLogs[log.time_slot_id].data.push({ x: minutes, y: log.decibels });
  });

  const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b'];
  const datasets = Object.entries(groupedLogs).map(([slotId, slot], index) => ({
    label: slot.name,
    data: slot.data.sort((a, b) => a.x - b.x),
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
    plugins: { legend: { position: 'top' }, title: { display: true, text: 'Sound Levels Over Time', font: { size: 18 }}}
  };

  return <div style={{ height: '400px' }}><Line data={data} options={options} /></div>;
};

// Average Bar Chart
export const AverageBar = ({ logsData, thresholds }) => {
  if (!logsData || logsData.length === 0) {
    return <div className="text-gray-600 text-center py-8">No data available</div>;
  }

  const slotAverages = {};
  logsData.forEach(log => {
    if (!slotAverages[log.time_slot_id]) {
      slotAverages[log.time_slot_id] = { name: log.slot_name, total: 0, count: 0 };
    }
    slotAverages[log.time_slot_id].total += log.decibels;
    slotAverages[log.time_slot_id].count += 1;
  });

  const labels = [];
  const averages = [];
  const colors = [];

  Object.values(slotAverages).forEach(slot => {
    const avg = slot.total / slot.count;
    labels.push(slot.name);
    averages.push(avg);
    colors.push(avg <= thresholds.orange_threshold ? '#22c55e' : avg <= thresholds.red_threshold ? '#f97316' : '#ef4444');
  });

  const data = { labels, datasets: [{ label: 'Average Decibels', data: averages, backgroundColor: colors }]};
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: { y: { min: 0, max: 100, title: { display: true, text: 'Decibels (dB)' }}},
    plugins: { legend: { display: false }, title: { display: true, text: 'Average Sound Level by Period', font: { size: 18 }}}
  };

  return <div style={{ height: '400px' }}><Bar data={data} options={options} /></div>;
};

// Peak Comparison Chart
export const PeakComparison = ({ logsData, thresholds }) => {
  if (!logsData || logsData.length === 0) {
    return <div className="text-gray-600 text-center py-8">No data available</div>;
  }

  const slotPeaks = {};
  logsData.forEach(log => {
    if (!slotPeaks[log.time_slot_id] || log.decibels > slotPeaks[log.time_slot_id].peak) {
      slotPeaks[log.time_slot_id] = { name: log.slot_name, peak: log.decibels, timestamp: log.timestamp };
    }
  });

  const labels = [];
  const peaks = [];
  const colors = [];

  Object.values(slotPeaks).forEach(slot => {
    labels.push(slot.name);
    peaks.push(slot.peak);
    colors.push(slot.peak <= thresholds.orange_threshold ? '#22c55e' : slot.peak <= thresholds.red_threshold ? '#f97316' : '#ef4444');
  });

  const data = { labels, datasets: [{ label: 'Peak Decibels', data: peaks, backgroundColor: colors }]};
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: { y: { min: 0, max: 100, title: { display: true, text: 'Decibels (dB)' }}},
    plugins: { legend: { display: false }, title: { display: true, text: 'Peak Noise Level by Period', font: { size: 18 }}}
  };

  return <div style={{ height: '400px' }}><Bar data={data} options={options} /></div>;
};

// Zone Percentage Chart
export const ZonePercentage = ({ logsData, thresholds }) => {
  if (!logsData || logsData.length === 0) {
    return <div className="text-gray-600 text-center py-8">No data available</div>;
  }

  const slotZones = {};
  logsData.forEach(log => {
    if (!slotZones[log.time_slot_id]) {
      slotZones[log.time_slot_id] = { name: log.slot_name, green: 0, orange: 0, red: 0, total: 0 };
    }
    const slot = slotZones[log.time_slot_id];
    slot.total += 1;
    if (log.decibels <= thresholds.orange_threshold) slot.green += 1;
    else if (log.decibels <= thresholds.red_threshold) slot.orange += 1;
    else slot.red += 1;
  });

  const labels = [];
  const greenPercentages = [];
  const orangePercentages = [];
  const redPercentages = [];

  Object.values(slotZones).forEach(slot => {
    labels.push(slot.name);
    greenPercentages.push((slot.green / slot.total * 100).toFixed(1));
    orangePercentages.push((slot.orange / slot.total * 100).toFixed(1));
    redPercentages.push((slot.red / slot.total * 100).toFixed(1));
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
    plugins: { legend: { position: 'top' }, title: { display: true, text: 'Time in Each Zone by Period', font: { size: 18 }}}
  };

  return <div style={{ height: '400px' }}><Bar data={data} options={options} /></div>;
};
