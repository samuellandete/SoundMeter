import React, { useEffect } from 'react';
import { useAudioLevel } from './hooks/useAudioLevel';

function App() {
  const { decibels, isInitialized, error, initialize } = useAudioLevel(1000);

  useEffect(() => {
    // Auto-initialize on mount
    initialize();
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-8">Sound Meter</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          Error: {error}
        </div>
      )}

      {!isInitialized && !error && (
        <button
          onClick={initialize}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Start Monitoring
        </button>
      )}

      {isInitialized && (
        <div className="text-6xl font-bold text-gray-800">
          {decibels.toFixed(1)} dB
        </div>
      )}
    </div>
  );
}

export default App;
