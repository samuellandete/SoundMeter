import React, { useState } from 'react';
import axios from 'axios';

const EmailConfigPanel = ({ emailConfig, onChange }) => {
  const [testMessage, setTestMessage] = useState(null);
  const [isSendingTest, setIsSendingTest] = useState(false);

  const handleChange = (key, value) => {
    onChange({
      ...emailConfig,
      [key]: value
    });
  };

  const handleTestEmail = async () => {
    setIsSendingTest(true);
    setTestMessage(null);

    try {
      const API_BASE_URL = process.env.REACT_APP_API_URL || '';
      const response = await axios.post(`${API_BASE_URL}/api/email-alert/test`, {}, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 200 && response.data.success) {
        setTestMessage({ type: 'success', text: response.data.message });
      } else {
        setTestMessage({ type: 'error', text: response.data.message || 'Failed to send test email' });
      }
    } catch (error) {
      setTestMessage({
        type: 'error',
        text: error.response?.data?.message || error.message || 'Error sending test email'
      });
    }

    setIsSendingTest(false);
    setTimeout(() => setTestMessage(null), 5000);
  };

  return (
    <div className="mb-6">
      {/* Separator line */}
      <div className="border-t border-gray-200 mb-6"></div>

      <h3 className="text-lg font-semibold text-gray-700 mb-4">Email Alerts</h3>
      <p className="text-sm text-gray-500 mb-4">
        Configure automated email notifications when sound thresholds are exceeded
      </p>

      {/* Enable/Disable Toggle */}
      <div className="mb-4">
        <label className="flex items-center cursor-pointer">
          <div className="relative">
            <input
              type="checkbox"
              checked={emailConfig.enabled}
              onChange={(e) => handleChange('enabled', e.target.checked)}
              className="sr-only"
            />
            <div className={`block w-14 h-8 rounded-full ${emailConfig.enabled ? 'bg-green-500' : 'bg-gray-300'}`}></div>
            <div className={`absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${emailConfig.enabled ? 'transform translate-x-6' : ''}`}></div>
          </div>
          <span className="ml-3 text-sm font-medium text-gray-700">
            {emailConfig.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </label>
      </div>

      {/* Email Configuration Fields */}
      <div className="space-y-4">
        {/* Recipient */}
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">
            Recipient Email
          </label>
          <input
            type="email"
            value={emailConfig.recipient}
            onChange={(e) => handleChange('recipient', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="recipient@example.com"
          />
        </div>

        {/* SMTP Configuration */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">
              SMTP Host
            </label>
            <input
              type="text"
              value={emailConfig.smtp_host}
              onChange={(e) => handleChange('smtp_host', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="172.17.50.100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">
              SMTP Port
            </label>
            <input
              type="number"
              value={emailConfig.smtp_port}
              onChange={(e) => handleChange('smtp_port', parseInt(e.target.value))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="25"
            />
          </div>
        </div>

        {/* Thresholds */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">
              Instant Threshold: {emailConfig.instant_threshold_db} dB
            </label>
            <input
              type="range"
              min="70"
              max="100"
              step="0.5"
              value={emailConfig.instant_threshold_db}
              onChange={(e) => handleChange('instant_threshold_db', parseFloat(e.target.value))}
              className="w-full h-2 bg-red-400 rounded-lg appearance-none cursor-pointer"
            />
            <p className="text-xs text-gray-500 mt-1">
              Alert when any reading exceeds this level
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">
              Average Threshold: {emailConfig.average_threshold_db} dB
            </label>
            <input
              type="range"
              min="60"
              max="90"
              step="0.5"
              value={emailConfig.average_threshold_db}
              onChange={(e) => handleChange('average_threshold_db', parseFloat(e.target.value))}
              className="w-full h-2 bg-orange-400 rounded-lg appearance-none cursor-pointer"
            />
            <p className="text-xs text-gray-500 mt-1">
              Alert when rolling average exceeds this level
            </p>
          </div>
        </div>

        {/* Time Windows */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">
              Cooldown Period
            </label>
            <select
              value={emailConfig.cooldown_minutes}
              onChange={(e) => handleChange('cooldown_minutes', parseInt(e.target.value))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="5">5 minutes</option>
              <option value="10">10 minutes</option>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Minimum time between alerts of same type
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">
              Average Time Window
            </label>
            <select
              value={emailConfig.average_time_window_minutes}
              onChange={(e) => handleChange('average_time_window_minutes', parseInt(e.target.value))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="3">3 minutes</option>
              <option value="5">5 minutes</option>
              <option value="10">10 minutes</option>
              <option value="15">15 minutes</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Rolling window for average calculation
            </p>
          </div>
        </div>

        {/* Test Email Button */}
        <div className="pt-2">
          <button
            onClick={handleTestEmail}
            disabled={isSendingTest || !emailConfig.enabled}
            className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isSendingTest ? 'Sending...' : 'Send Test Email'}
          </button>
          {!emailConfig.enabled && (
            <span className="ml-3 text-sm text-gray-500">
              Enable email alerts to test
            </span>
          )}
        </div>

        {/* Test Message */}
        {testMessage && (
          <div className={`p-3 rounded-lg text-sm ${
            testMessage.type === 'success'
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
          }`}>
            {testMessage.text}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmailConfigPanel;
