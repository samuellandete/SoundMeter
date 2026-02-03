/**
 * Time Slot Utilities
 * Functions for detecting current time slot and lunch hours
 */

/**
 * Parse time string (HH:MM or HH:MM:SS) to minutes since midnight
 * @param {string} timeStr - Time string in HH:MM or HH:MM:SS format
 * @returns {number} Minutes since midnight
 */
const parseTimeToMinutes = (timeStr) => {
  const parts = timeStr.split(':');
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  return hours * 60 + minutes;
};

/**
 * Get current time as minutes since midnight
 * @param {Date} date - Optional date object (defaults to now)
 * @returns {number} Minutes since midnight
 */
const getCurrentMinutes = (date = new Date()) => {
  return date.getHours() * 60 + date.getMinutes();
};

/**
 * Detect which time slot the current time falls into
 * @param {Array} timeSlots - Array of time slot objects with start_time and end_time
 * @param {Date} currentTime - Optional current time (defaults to now)
 * @returns {Object|null} The current time slot object or null if not in any slot
 *
 * @example
 * const timeSlots = [
 *   { id: 1, name: 'Period 1', start_time: '11:30:00', end_time: '12:00:00' },
 *   { id: 2, name: 'Period 2', start_time: '12:00:00', end_time: '12:30:00' }
 * ];
 * const currentSlot = getCurrentTimeSlot(timeSlots);
 * // Returns the slot object if current time is within a slot, null otherwise
 */
export const getCurrentTimeSlot = (timeSlots, currentTime = new Date()) => {
  if (!timeSlots || timeSlots.length === 0) {
    return null;
  }

  const currentMinutes = getCurrentMinutes(currentTime);

  for (const slot of timeSlots) {
    const startMinutes = parseTimeToMinutes(slot.start_time);
    const endMinutes = parseTimeToMinutes(slot.end_time);

    // Check if current time falls within this slot
    if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
      return slot;
    }
  }

  return null;
};

/**
 * Check if current time is during lunch hours (between time slots)
 * Lunch hours are defined as times that fall outside all time slots
 * but within the overall school day (before first slot start or after last slot end)
 *
 * @param {Array} timeSlots - Array of time slot objects with start_time and end_time
 * @param {Date} currentTime - Optional current time (defaults to now)
 * @returns {boolean} True if it's lunch hour, false otherwise
 *
 * @example
 * const timeSlots = [
 *   { id: 1, start_time: '11:30:00', end_time: '12:00:00' },
 *   { id: 2, start_time: '12:00:00', end_time: '12:30:00' },
 *   { id: 3, start_time: '12:30:00', end_time: '13:00:00' },
 *   { id: 4, start_time: '13:30:00', end_time: '14:00:00' }
 * ];
 * // At 13:15, isLunchHour returns true (gap between slot 3 and 4)
 * // At 12:15, isLunchHour returns false (within slot 2)
 */
export const isLunchHour = (timeSlots, currentTime = new Date()) => {
  if (!timeSlots || timeSlots.length === 0) {
    return false;
  }

  const currentMinutes = getCurrentMinutes(currentTime);

  // Sort time slots by start time
  const sortedSlots = [...timeSlots].sort((a, b) => {
    return parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time);
  });

  const firstSlotStart = parseTimeToMinutes(sortedSlots[0].start_time);
  const lastSlotEnd = parseTimeToMinutes(sortedSlots[sortedSlots.length - 1].end_time);

  // Before first slot or after last slot is not lunch hour
  if (currentMinutes < firstSlotStart || currentMinutes >= lastSlotEnd) {
    return false;
  }

  // Check if we're in a gap between slots
  for (let i = 0; i < sortedSlots.length - 1; i++) {
    const currentSlotEnd = parseTimeToMinutes(sortedSlots[i].end_time);
    const nextSlotStart = parseTimeToMinutes(sortedSlots[i + 1].start_time);

    // If there's a gap and we're in it, it's lunch hour
    if (nextSlotStart > currentSlotEnd &&
        currentMinutes >= currentSlotEnd &&
        currentMinutes < nextSlotStart) {
      return true;
    }
  }

  // If we're currently in a time slot, it's not lunch hour
  return false;
};

/**
 * Get the time remaining until the next time slot starts
 * @param {Array} timeSlots - Array of time slot objects
 * @param {Date} currentTime - Optional current time (defaults to now)
 * @returns {number|null} Minutes until next slot starts, or null if in a slot or no next slot
 */
export const getMinutesUntilNextSlot = (timeSlots, currentTime = new Date()) => {
  if (!timeSlots || timeSlots.length === 0) {
    return null;
  }

  const currentMinutes = getCurrentMinutes(currentTime);

  // Sort time slots by start time
  const sortedSlots = [...timeSlots].sort((a, b) => {
    return parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time);
  });

  // Find the next slot that starts after current time
  for (const slot of sortedSlots) {
    const startMinutes = parseTimeToMinutes(slot.start_time);
    if (startMinutes > currentMinutes) {
      return startMinutes - currentMinutes;
    }
  }

  return null;
};
