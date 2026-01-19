import React from 'react';

const TrafficLight = ({ decibels, thresholds }) => {
  const { green_max, yellow_max } = thresholds;

  const getColor = () => {
    if (decibels <= green_max) return 'traffic-green';
    if (decibels <= yellow_max) return 'traffic-yellow';
    return 'traffic-red';
  };

  const getColorClass = () => {
    const color = getColor();
    return `bg-${color}`;
  };

  const getTextColor = () => {
    const color = getColor();
    return `text-${color}`;
  };

  return (
    <div className="flex flex-col items-center">
      {/* Traffic Light Circle */}
      <div
        className={`w-64 h-64 rounded-full ${getColorClass()} shadow-2xl flex items-center justify-center transition-colors duration-300`}
      >
        <span className="text-white text-7xl font-bold">
          {decibels.toFixed(0)}
        </span>
      </div>

      {/* Decibel Label */}
      <div className={`mt-6 text-4xl font-bold ${getTextColor()}`}>
        dB
      </div>

      {/* Status Text */}
      <div className="mt-4 text-xl text-gray-600">
        {decibels <= green_max && 'Quiet'}
        {decibels > green_max && decibels <= yellow_max && 'Moderate'}
        {decibels > yellow_max && 'Too Loud'}
      </div>
    </div>
  );
};

export default TrafficLight;
