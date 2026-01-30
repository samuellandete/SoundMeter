import React, { useState } from 'react';

const ZoneSelector = ({ zones, onZoneSelect, onDeviceModeSelect, initialStep = 'zone' }) => {
  const [step, setStep] = useState(initialStep);
  const [selectedZone, setSelectedZone] = useState(null);

  const handleZoneClick = (zone) => {
    setSelectedZone(zone);
    setStep('mode');
  };

  const handleModeClick = (mode) => {
    onZoneSelect(selectedZone);
    onDeviceModeSelect(mode);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex flex-col">
      <div className="flex-grow flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
          <h1 className="text-3xl font-bold text-gray-800 text-center mb-2">
            Sound Meter
          </h1>

          {step === 'zone' && (
            <>
              <p className="text-gray-600 text-center mb-8">
                Select the zone where this device is located
              </p>

              <div className="space-y-3">
                {zones.map(zone => (
                  <button
                    key={zone.id}
                    onClick={() => handleZoneClick(zone)}
                    className="w-full py-4 px-6 bg-asv-blue hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors text-lg shadow-md hover:shadow-lg"
                  >
                    {zone.name}
                  </button>
                ))}
              </div>

              <p className="text-sm text-gray-500 text-center mt-6">
                You can change these settings later
              </p>
            </>
          )}

          {step === 'mode' && (
            <>
              <p className="text-gray-600 text-center mb-8">
                How will this device be used?
              </p>

              <div className="space-y-4">
                <button
                  onClick={() => handleModeClick('measuring')}
                  className="w-full py-5 px-6 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors shadow-md hover:shadow-lg text-left"
                >
                  <div className="text-lg mb-1">Measuring Device</div>
                  <div className="text-sm font-normal opacity-90">
                    Records sound levels during lunch hours. Requires microphone access.
                  </div>
                </button>

                <button
                  onClick={() => handleModeClick('dashboard')}
                  className="w-full py-5 px-6 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors shadow-md hover:shadow-lg text-left"
                >
                  <div className="text-lg mb-1">Dashboard</div>
                  <div className="text-sm font-normal opacity-90">
                    View logs and graphs only. No microphone needed.
                  </div>
                </button>
              </div>

              <button
                onClick={() => setStep('zone')}
                className="w-full mt-6 text-sm text-gray-500 hover:text-blue-500 underline"
              >
                Back to zone selection
              </button>
            </>
          )}
        </div>
      </div>

      {/* Footer with School Logo */}
      <footer className="bg-asv-blue py-4">
        <div className="container mx-auto px-4 flex justify-center">
          <img
            src="https://asvalencia.org/wp-content/svg/logo.png"
            alt="American School of Valencia"
            className="h-12"
          />
        </div>
      </footer>
    </div>
  );
};

export default ZoneSelector;
