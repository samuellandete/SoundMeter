import { useState, useEffect, useRef } from 'react';
import AudioProcessor from '../utils/audioProcessor';

export const useAudioLevel = (updateInterval = 1000) => {
  const [decibels, setDecibels] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState(null);
  const audioProcessorRef = useRef(null);
  const intervalRef = useRef(null);

  const initialize = async () => {
    const processor = new AudioProcessor();
    const result = await processor.initialize();

    if (result.success) {
      audioProcessorRef.current = processor;
      setIsInitialized(true);
      setError(null);
    } else {
      setError(result.error);
    }
  };

  const stop = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    if (audioProcessorRef.current) {
      audioProcessorRef.current.stop();
    }
    setIsInitialized(false);
  };

  useEffect(() => {
    if (isInitialized && audioProcessorRef.current) {
      // Update decibels at specified interval
      intervalRef.current = setInterval(() => {
        const db = audioProcessorRef.current.getDecibels();
        setDecibels(db);
      }, updateInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isInitialized, updateInterval]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, []);

  return {
    decibels,
    isInitialized,
    error,
    initialize,
    stop
  };
};
