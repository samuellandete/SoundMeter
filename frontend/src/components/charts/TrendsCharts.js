import React from 'react';
import { Bar, Line } from 'react-chartjs-2';

// Color palette for different periods
const periodColors = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
  '#06b6d4', '#84cc16', '#f43f5e', '#6366f1', '#14b8a6'
];

/**
 * Helper to get color based on dB value and thresholds
 */
const getZoneColor = (value, thresholds) => {
  if (value <= thresholds.orange) return '#22c55e';
  if (value <= thresholds.red) return '#f97316';
  return '#ef4444';
};

/**
 * Average dB Bar Chart - compares average across periods
 */
export const TrendsAverageChart = ({ trendsData, selectedZone, selectedSlot }) => {
  if (!trendsData?.periods?.length) {
    return <div className="text-gray-600 text-center py-8">No data available</div>;
  }

  const labels = [];
  const values = [];
  const colors = [];

  trendsData.periods.forEach(period => {
    const matchingData = period.data.find(
      d => d.zone_id === selectedZone && d.slot_id === selectedSlot
    );
    if (matchingData) {
      labels.push(period.label);
      values.push(matchingData.avg_db);
      colors.push(getZoneColor(matchingData.avg_db, trendsData.thresholds));
    }
  });

  const data = {
    labels,
    datasets: [{
      label: 'Average dB',
      data: values,
      backgroundColor: colors
    }]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { min: 0, max: 100, title: { display: true, text: 'Decibels (dB)' } }
    },
    plugins: {
      legend: { display: false },
      title: { display: true, text: 'Average Sound Level', font: { size: 18 } }
    }
  };

  return <div style={{ height: '400px' }}><Bar data={data} options={options} /></div>;
};

/**
 * Peak dB Bar Chart - compares peak values across periods
 */
export const TrendsPeakChart = ({ trendsData, selectedZone, selectedSlot }) => {
  if (!trendsData?.periods?.length) {
    return <div className="text-gray-600 text-center py-8">No data available</div>;
  }

  const labels = [];
  const values = [];
  const colors = [];

  trendsData.periods.forEach(period => {
    const matchingData = period.data.find(
      d => d.zone_id === selectedZone && d.slot_id === selectedSlot
    );
    if (matchingData) {
      labels.push(period.label);
      values.push(matchingData.peak_db);
      colors.push(getZoneColor(matchingData.peak_db, trendsData.thresholds));
    }
  });

  const data = {
    labels,
    datasets: [{
      label: 'Peak dB',
      data: values,
      backgroundColor: colors
    }]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { min: 0, max: 120, title: { display: true, text: 'Decibels (dB)' } }
    },
    plugins: {
      legend: { display: false },
      title: { display: true, text: 'Peak Sound Level', font: { size: 18 } }
    }
  };

  return <div style={{ height: '400px' }}><Bar data={data} options={options} /></div>;
};

/**
 * Zone Time Percentage Stacked Bar Chart
 */
export const TrendsZoneTimeChart = ({ trendsData, selectedZone, selectedSlot }) => {
  if (!trendsData?.periods?.length) {
    return <div className="text-gray-600 text-center py-8">No data available</div>;
  }

  const labels = [];
  const greenData = [];
  const orangeData = [];
  const redData = [];

  trendsData.periods.forEach(period => {
    const matchingData = period.data.find(
      d => d.zone_id === selectedZone && d.slot_id === selectedSlot
    );
    if (matchingData) {
      labels.push(period.label);
      greenData.push(matchingData.green_pct);
      orangeData.push(matchingData.orange_pct);
      redData.push(matchingData.red_pct);
    }
  });

  const data = {
    labels,
    datasets: [
      { label: 'Quiet (Green)', data: greenData, backgroundColor: '#22c55e' },
      { label: 'Moderate (Orange)', data: orangeData, backgroundColor: '#f97316' },
      { label: 'Too Loud (Red)', data: redData, backgroundColor: '#ef4444' }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { stacked: true },
      y: { stacked: true, min: 0, max: 100, title: { display: true, text: 'Percentage (%)' } }
    },
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: 'Time in Each Noise Level', font: { size: 18 } }
    }
  };

  return <div style={{ height: '400px' }}><Bar data={data} options={options} /></div>;
};

/**
 * Trend Line Chart - shows average over time
 */
export const TrendLineChart = ({ trendsData, selectedZone, selectedSlot }) => {
  if (!trendsData?.periods?.length) {
    return <div className="text-gray-600 text-center py-8">No data available</div>;
  }

  const labels = [];
  const values = [];

  trendsData.periods.forEach(period => {
    const matchingData = period.data.find(
      d => d.zone_id === selectedZone && d.slot_id === selectedSlot
    );
    if (matchingData) {
      labels.push(period.label);
      values.push(matchingData.avg_db);
    }
  });

  const data = {
    labels,
    datasets: [{
      label: 'Average dB',
      data: values,
      borderColor: '#3b82f6',
      backgroundColor: '#3b82f620',
      tension: 0.3,
      fill: true
    }]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { min: 0, max: 100, title: { display: true, text: 'Decibels (dB)' } }
    },
    plugins: {
      legend: { display: false },
      title: { display: true, text: 'Trend Over Time', font: { size: 18 } }
    }
  };

  return <div style={{ height: '400px' }}><Line data={data} options={options} /></div>;
};

/**
 * Multi-series charts for comparing all zones or all slots
 */
export const TrendsMultiSeriesChart = ({ trendsData, mode, selectedZone, selectedSlot, config }) => {
  if (!trendsData?.periods?.length) {
    return <div className="text-gray-600 text-center py-8">No data available</div>;
  }

  const labels = trendsData.periods.map(p => p.label);
  const datasets = [];

  if (mode === 'allSlots' && selectedZone) {
    // Show all slots for selected zone
    const slotIds = [...new Set(trendsData.periods.flatMap(p => p.data.map(d => d.slot_id)))];
    slotIds.forEach((slotId, index) => {
      const slotData = trendsData.periods.map(period => {
        const match = period.data.find(d => d.zone_id === selectedZone && d.slot_id === slotId);
        return match ? match.avg_db : null;
      });
      const slotName = config.time_slots?.find(s => s.id === slotId)?.name || `Period ${slotId}`;
      datasets.push({
        label: slotName,
        data: slotData,
        borderColor: periodColors[index % periodColors.length],
        backgroundColor: periodColors[index % periodColors.length] + '20',
        tension: 0.3
      });
    });
  } else if (mode === 'allZones' && selectedSlot) {
    // Show all zones for selected slot
    const zoneIds = [...new Set(trendsData.periods.flatMap(p => p.data.map(d => d.zone_id)))];
    zoneIds.forEach((zoneId, index) => {
      const zoneData = trendsData.periods.map(period => {
        const match = period.data.find(d => d.zone_id === zoneId && d.slot_id === selectedSlot);
        return match ? match.avg_db : null;
      });
      const zoneName = config.zones?.find(z => z.id === zoneId)?.name || `Zone ${zoneId}`;
      datasets.push({
        label: zoneName,
        data: zoneData,
        borderColor: periodColors[index % periodColors.length],
        backgroundColor: periodColors[index % periodColors.length] + '20',
        tension: 0.3
      });
    });
  }

  const data = { labels, datasets };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { min: 0, max: 100, title: { display: true, text: 'Average dB' } }
    },
    plugins: {
      legend: { position: 'top' },
      title: {
        display: true,
        text: mode === 'allSlots' ? 'Compare Periods' : 'Compare Zones',
        font: { size: 18 }
      }
    }
  };

  return <div style={{ height: '400px' }}><Line data={data} options={options} /></div>;
};
