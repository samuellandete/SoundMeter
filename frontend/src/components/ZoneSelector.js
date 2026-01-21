import React from 'react';

const ZoneSelector = ({ zones, onZoneSelect }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-gray-800 text-center mb-2">
          Sound Meter
        </h1>
        <p className="text-gray-600 text-center mb-8">
          Select the zone where this device is located
        </p>

        <div className="space-y-3">
          {zones.map(zone => (
            <button
              key={zone.id}
              onClick={() => onZoneSelect(zone)}
              className="w-full py-4 px-6 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors text-lg shadow-md hover:shadow-lg"
            >
              {zone.name}
            </button>
          ))}
        </div>

        <p className="text-sm text-gray-500 text-center mt-6">
          You can change the zone later from the main screen
        </p>
      </div>
    </div>
  );
};

export default ZoneSelector;
