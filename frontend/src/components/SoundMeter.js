import React, { useState, useEffect } from 'react';
import { useAudioLevel } from '../hooks/useAudioLevel';
import TrafficLight from './TrafficLight';
import { requestWakeLock, releaseWakeLock } from '../utils/wakeLock';

const SoundMeter = ({ config, onLogSave }) => {
  const { visual_update_rate, thresholds, calibration_offset = 0 } = config;
  const { decibels: rawDecibels, isInitialized, error, initialize } = useAudioLevel(visual_update_rate);

  // Apply calibration offset to get calibrated decibels
  const decibels = Math.max(0, Math.min(120, rawDecibels + calibration_offset));
  const [isRecording, setIsRecording] = useState(false);
  const [nextLogIn, setNextLogIn] = useState(30);

  // Check if within recording hours (11:30-13:30 CET)
  const isWithinRecordingHours = () => {
    const now = new Date();
    const cet = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Paris',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(now);

    const [hours, minutes] = cet.split(':').map(Number);
    const timeInMinutes = hours * 60 + minutes;
    const startTime = 11 * 60 + 30; // 11:30
    const endTime = 13 * 60 + 30;   // 13:30

    return timeInMinutes >= startTime && timeInMinutes <= endTime;
  };

  // Update recording status every second
  useEffect(() => {
    const checkRecording = () => {
      setIsRecording(isWithinRecordingHours());
    };

    checkRecording();
    const interval = setInterval(checkRecording, 1000);

    return () => clearInterval(interval);
  }, []);

  // Log countdown timer
  useEffect(() => {
    if (!isRecording) return;

    const countdown = setInterval(() => {
      setNextLogIn(prev => {
        if (prev <= 1) {
          // Save log
          if (onLogSave && isInitialized) {
            onLogSave(decibels);
          }
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdown);
  }, [isRecording, isInitialized, decibels, onLogSave]);

  // Wake lock to prevent iPad sleep during recording
  useEffect(() => {
    if (isRecording) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }
  }, [isRecording]);

  // Auto-start monitoring on component mount
  useEffect(() => {
    if (!isInitialized && !error) {
      initialize();
    }
  }, []);

  return (
    <div className="flex flex-col items-center">
      {/* Recording Status */}
      <div className="mb-8 flex items-center gap-3">
        <div className={`w-4 h-4 rounded-full ${isRecording ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
        <span className="text-lg font-semibold text-gray-700">
          {isRecording ? 'Recording' : 'Stopped'}
        </span>
        {isRecording && (
          <span className="text-sm text-gray-500">
            Next log in {nextLogIn}s
          </span>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg max-w-md">
          <p className="font-bold">Microphone Error</p>
          <p className="text-sm mt-1">{error}</p>
          {error.includes('HTTPS') ? (
            <p className="text-xs mt-2">
              For remote access, configure HTTPS on your server or use a reverse proxy with SSL.
            </p>
          ) : (
            <p className="text-xs mt-2">
              Please enable microphone access in your browser settings.
            </p>
          )}
        </div>
      )}

      {/* Traffic Light Display - shows loading state until initialized */}
      {isInitialized ? (
        <TrafficLight decibels={decibels} thresholds={thresholds} />
      ) : !error && (
        <div className="mb-8 text-gray-500">Initializing microphone...</div>
      )}
    </div>
  );
};

export default SoundMeter;
