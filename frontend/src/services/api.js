import axios from 'axios';

// Use relative URL when served from same origin (Docker/production)
// Use absolute URL only for local development with separate frontend server
const API_BASE_URL = process.env.REACT_APP_API_URL || '';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const apiService = {
  // Get configuration
  getConfig: async () => {
    try {
      const response = await api.get('/api/config');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Update configuration
  updateConfig: async (config) => {
    try {
      const response = await api.post('/api/config', config);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Save sound log
  saveLog: async (decibels, zoneId = null) => {
    try {
      const timestamp = new Date().toISOString();
      const payload = {
        timestamp,
        decibels
      };
      if (zoneId) {
        payload.zone_id = zoneId;
      }
      const response = await api.post('/api/logs', payload);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get logs
  getLogs: async (date, slots = [1, 2, 3, 4], zones = null) => {
    try {
      const slotsParam = slots.join(',');
      let url = `/api/logs?date=${date}&slots=${slotsParam}`;
      if (zones && zones.length > 0) {
        url += `&zones=${zones.join(',')}`;
      }
      const response = await api.get(url);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Export CSV
  exportCSV: async (date, slots = [1, 2, 3, 4], zones = null) => {
    try {
      const slotsParam = slots.join(',');
      let url = `/api/export?date=${date}&slots=${slotsParam}`;
      if (zones && zones.length > 0) {
        url += `&zones=${zones.join(',')}`;
      }
      const response = await api.get(url, {
        responseType: 'blob'
      });

      // Create download link
      const url2 = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url2;
      link.setAttribute('download', `soundmeter_${date}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
