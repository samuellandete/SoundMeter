import React from 'react';

const TrafficLight = ({ decibels, thresholds }) => {
  const { orange_threshold, red_threshold } = thresholds;

  const isGreen = decibels <= orange_threshold;
  const isOrange = decibels > orange_threshold && decibels <= red_threshold;
  const isRed = decibels > red_threshold;

  return (
    <div className="flex flex-col items-center">
      {/* Traffic Light Circle */}
      <div
        className={`w-64 h-64 rounded-full shadow-2xl flex items-center justify-center transition-colors duration-300 ${
          isGreen ? 'bg-traffic-green' : isOrange ? 'bg-traffic-orange' : 'bg-traffic-red'
        }`}
      >
        <span className="text-white text-7xl font-bold">
          {decibels.toFixed(0)}
        </span>
      </div>

      {/* Decibel Label */}
      <div className={`mt-6 text-4xl font-bold ${
        isGreen ? 'text-traffic-green' : isOrange ? 'text-traffic-orange' : 'text-traffic-red'
      }`}>
        dB
      </div>

      {/* Status Text */}
      <div className="mt-4 text-xl text-gray-600">
        {isGreen && 'Quiet'}
        {isOrange && 'Moderate'}
        {isRed && 'Too Loud'}
      </div>
    </div>
  );
};

export default TrafficLight;
