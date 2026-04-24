import React, { useState, useEffect, useRef } from 'react';
import { useAudioLevel } from '../hooks/useAudioLevel';
import { useEmailAlerts } from '../hooks/useEmailAlerts';
import TrafficLight from './TrafficLight';
import { requestWakeLock, releaseWakeLock } from '../utils/wakeLock';
import students from '../data/students';

const CALIBRATION_KEY = (zoneId) => `soundmeter_calibration_zone_${zoneId}`;

const SoundMeter = ({ config, onLogSave, selectedZone }) => {
  const { visual_update_rate, thresholds, time_slots = [] } = config;
  const { decibels: rawDecibels, isInitialized, error, initialize } = useAudioLevel(visual_update_rate);
  const { checkThresholds } = useEmailAlerts();

  // Calibration offset stored per zone in localStorage
  const [calibrationOffset, setCalibrationOffset] = useState(0);
  useEffect(() => {
    if (selectedZone?.id) {
      const stored = localStorage.getItem(CALIBRATION_KEY(selectedZone.id));
      setCalibrationOffset(stored !== null ? parseFloat(stored) : 0);
    }
  }, [selectedZone?.id]);

  const decibels = Math.max(0, Math.min(120, rawDecibels + calibrationOffset));
  const [isRecording, setIsRecording] = useState(false);
  const [nextLogIn, setNextLogIn] = useState(30);
  const [pickedName, setPickedName] = useState(null);
  const nameTimerRef = useRef(null);

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
    return timeInMinutes >= 11 * 60 + 30 && timeInMinutes <= 13 * 60 + 30;
  };

  useEffect(() => {
    const checkRecording = () => setIsRecording(isWithinRecordingHours());
    checkRecording();
    const interval = setInterval(checkRecording, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isRecording) return;
    const countdown = setInterval(() => {
      setNextLogIn(prev => {
        if (prev <= 1) {
          if (onLogSave && isInitialized) onLogSave(decibels);
          if (config.email_alerts?.enabled && time_slots.length > 0) {
            checkThresholds(decibels, config, time_slots)
              .then(result => {
                if (result.checked) {
                  if (result.instantCheck?.triggered) console.log('Instant threshold alert:', result.instantCheck);
                  if (result.averageCheck?.triggered) console.log('Average threshold alert:', result.averageCheck);
                }
              })
              .catch(err => console.error('Error checking email thresholds:', err));
          }
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(countdown);
  }, [isRecording, isInitialized, decibels, onLogSave, config, time_slots, checkThresholds]);

  useEffect(() => {
    if (isRecording) requestWakeLock();
    else releaseWakeLock();
  }, [isRecording]);

  useEffect(() => {
    if (!isInitialized && !error) initialize();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pickName = (grade) => {
    const list = students[grade];
    if (!list || list.length === 0) return;
    const name = list[Math.floor(Math.random() * list.length)];
    setPickedName(name);
    clearTimeout(nameTimerRef.current);
    nameTimerRef.current = setTimeout(() => setPickedName(null), 1000);
  };

  const gradeLabels = ['K', '1', '2', '3', '4', '5'];

  return (
    <div className="relative flex items-start justify-center gap-8">
      <div className="flex flex-col items-center">
        {/* Recording Status */}
        <div className="mb-8 flex items-center gap-3">
          <div className={`w-4 h-4 rounded-full ${isRecording ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
          <span className="text-lg font-semibold text-gray-700">
            {isRecording ? 'Recording' : 'Stopped'}
          </span>
          {isRecording && (
            <span className="text-sm text-gray-500">Next log in {nextLogIn}s</span>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg max-w-md">
            <p className="font-bold">Microphone Error</p>
            <p className="text-sm mt-1">{error}</p>
            <p className="text-xs mt-2">
              {error.includes('HTTPS')
                ? 'For remote access, configure HTTPS on your server or use a reverse proxy with SSL.'
                : 'Please enable microphone access in your browser settings.'}
            </p>
          </div>
        )}

        {/* Traffic Light + picked name below */}
        {isInitialized ? (
          <>
            <TrafficLight decibels={decibels} thresholds={thresholds} />
            <p style={{ fontSize: '10px' }} className="text-gray-400 mt-2 text-center h-4">
              {pickedName || ''}
            </p>
          </>
        ) : !error && (
          <div className="mb-8 text-gray-500">Initializing microphone...</div>
        )}
      </div>

      {/* Grade Picker */}
      <div className="flex flex-col gap-3 pt-4">
        {gradeLabels.map((label, i) => (
          <button
            key={label}
            onClick={() => pickName(i)}
            className="w-14 h-14 rounded-xl bg-asv-blue text-white text-xl font-bold shadow-md active:scale-95 transition-transform"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default SoundMeter;
