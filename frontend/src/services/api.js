import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

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
  saveLog: async (decibels) => {
    try {
      const timestamp = new Date().toISOString();
      const response = await api.post('/api/logs', {
        timestamp,
        decibels
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get logs
  getLogs: async (date, slots = [1, 2, 3, 4]) => {
    try {
      const slotsParam = slots.join(',');
      const response = await api.get(`/api/logs?date=${date}&slots=${slotsParam}`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Export CSV
  exportCSV: async (date, slots = [1, 2, 3, 4]) => {
    try {
      const slotsParam = slots.join(',');
      const response = await api.get(`/api/export?date=${date}&slots=${slotsParam}`, {
        responseType: 'blob'
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
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
