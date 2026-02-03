import { useRef, useCallback } from 'react';
import { getCurrentTimeSlot, isLunchHour } from '../utils/timeSlotUtils';
import axios from 'axios';

/**
 * Custom hook for email alert functionality
 * Maintains a rolling buffer of decibel readings and triggers email alerts
 * when instant or average thresholds are exceeded
 */
export const useEmailAlerts = () => {
  // Rolling buffer for calculating averages
  const readingsBufferRef = useRef([]);
  const lastAlertCheckRef = useRef(null);

  /**
   * Add a reading to the rolling buffer
   * @param {number} decibels - Decibel reading
   * @param {Date} timestamp - Timestamp of reading
   */
  const addReading = useCallback((decibels, timestamp = new Date()) => {
    readingsBufferRef.current.push({
      decibels,
      timestamp
    });

    // Keep only readings from the last hour to prevent memory issues
    const oneHourAgo = new Date(timestamp.getTime() - 60 * 60 * 1000);
    readingsBufferRef.current = readingsBufferRef.current.filter(
      reading => reading.timestamp > oneHourAgo
    );
  }, []);

  /**
   * Calculate average decibels over a time window
   * @param {number} windowMinutes - Time window in minutes
   * @param {Date} currentTime - Current time
   * @returns {number|null} Average decibels or null if not enough data
   */
  const calculateAverage = useCallback((windowMinutes, currentTime = new Date()) => {
    const windowMs = windowMinutes * 60 * 1000;
    const windowStart = new Date(currentTime.getTime() - windowMs);

    const windowReadings = readingsBufferRef.current.filter(
      reading => reading.timestamp >= windowStart && reading.timestamp <= currentTime
    );

    if (windowReadings.length === 0) {
      return null;
    }

    const sum = windowReadings.reduce((acc, reading) => acc + reading.decibels, 0);
    return sum / windowReadings.length;
  }, []);

  /**
   * Send email alert via API
   * @param {string} alertType - 'instant' or 'average'
   * @param {number} currentDb - Current decibel reading
   * @param {number|null} averageDb - Average decibel reading (for average alerts)
   * @param {Object} timeSlot - Current time slot object
   * @returns {Promise<Object>} API response
   */
  const sendAlert = useCallback(async (alertType, currentDb, averageDb, timeSlot) => {
    try {
      const API_BASE_URL = process.env.REACT_APP_API_URL || '';
      const response = await axios.post(`${API_BASE_URL}/api/email-alert`, {
        alert_type: alertType,
        current_db: currentDb,
        average_db: averageDb,
        timestamp: new Date().toISOString(),
        time_slot_id: timeSlot.id
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return { success: true, data: response.data };
    } catch (error) {
      // Handle cooldown (429) separately
      if (error.response?.status === 429) {
        return {
          success: false,
          inCooldown: true,
          data: error.response.data
        };
      }

      return {
        success: false,
        error: error.message,
        data: error.response?.data
      };
    }
  }, []);

  /**
   * Check thresholds and send alerts if needed
   * @param {number} currentDb - Current decibel reading
   * @param {Object} config - Configuration object with email_alerts settings
   * @param {Array} timeSlots - Array of time slot objects
   * @returns {Promise<Object>} Result of threshold check
   */
  const checkThresholds = useCallback(async (currentDb, config, timeSlots) => {
    // Return early if email alerts are disabled
    if (!config?.email_alerts?.enabled) {
      return { checked: false, reason: 'Email alerts disabled' };
    }

    // Get current time slot
    const currentTime = new Date();
    const currentSlot = getCurrentTimeSlot(timeSlots, currentTime);

    // Don't send alerts if not in a time slot or during lunch
    if (!currentSlot) {
      return { checked: false, reason: 'Not in a time slot' };
    }

    if (isLunchHour(timeSlots, currentTime)) {
      return { checked: false, reason: 'Lunch hour' };
    }

    // Add current reading to buffer
    addReading(currentDb, currentTime);

    const results = {
      checked: true,
      instantCheck: null,
      averageCheck: null
    };

    // Check instant threshold
    const instantThreshold = config.email_alerts.instant_threshold_db;
    if (currentDb >= instantThreshold) {
      const alertResult = await sendAlert('instant', currentDb, null, currentSlot);
      results.instantCheck = {
        triggered: true,
        threshold: instantThreshold,
        currentDb,
        alertSent: alertResult.success,
        inCooldown: alertResult.inCooldown,
        error: alertResult.error,
        data: alertResult.data
      };
    } else {
      results.instantCheck = {
        triggered: false,
        threshold: instantThreshold,
        currentDb
      };
    }

    // Check average threshold
    const averageThreshold = config.email_alerts.average_threshold_db;
    const averageWindow = config.email_alerts.average_time_window_minutes;
    const averageDb = calculateAverage(averageWindow, currentTime);

    if (averageDb !== null && averageDb >= averageThreshold) {
      const alertResult = await sendAlert('average', currentDb, averageDb, currentSlot);
      results.averageCheck = {
        triggered: true,
        threshold: averageThreshold,
        averageDb,
        currentDb,
        windowMinutes: averageWindow,
        alertSent: alertResult.success,
        inCooldown: alertResult.inCooldown,
        error: alertResult.error,
        data: alertResult.data
      };
    } else {
      results.averageCheck = {
        triggered: false,
        threshold: averageThreshold,
        averageDb,
        windowMinutes: averageWindow
      };
    }

    lastAlertCheckRef.current = currentTime;
    return results;
  }, [addReading, calculateAverage, sendAlert]);

  /**
   * Clear the readings buffer
   */
  const clearBuffer = useCallback(() => {
    readingsBufferRef.current = [];
  }, []);

  /**
   * Get buffer status
   * @returns {Object} Buffer information
   */
  const getBufferStatus = useCallback(() => {
    return {
      size: readingsBufferRef.current.length,
      oldestReading: readingsBufferRef.current[0]?.timestamp || null,
      newestReading: readingsBufferRef.current[readingsBufferRef.current.length - 1]?.timestamp || null
    };
  }, []);

  return {
    checkThresholds,
    clearBuffer,
    getBufferStatus
  };
};
