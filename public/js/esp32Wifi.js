/**
 * StadiumSafe AI - Wi-Fi HTTP / WebSocket Driver
 * Connects browser to ESP32 over local network using HTTP REST API
 * (GET /api/sensors) and optional WebSocket.
 */

(function () {
  'use strict';

  let pollIntervalId = null;
  let wsClient = null;

  const Esp32Wifi = {
    isConnected: false,
    espIp: '192.168.1.100',
    pollIntervalMs: 600,
    consecutiveFailures: 0,
    maxFailuresBeforeDisconnect: 4,
    deviceInfo: null,

    // Connect to ESP32 using IP address
    async connect(ipAddress) {
      if (!ipAddress || ipAddress.trim() === '') {
        window.StadiumApp.showToast('Please enter a valid ESP32 IP address.', 'warning');
        return false;
      }

      // Sanitize IP format
      let sanitizedIp = ipAddress.trim();
      sanitizedIp = sanitizedIp.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
      this.espIp = sanitizedIp;

      this.logDebug(`Attempting Wi-Fi handshake with http://${this.espIp}/api/status...`, 'info');

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const response = await fetch(`http://${this.espIp}/api/status`, {
          method: 'GET',
          mode: 'cors',
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP status ${response.status}`);
        }

        const data = await response.json();
        this.deviceInfo = data;
        this.isConnected = true;
        this.consecutiveFailures = 0;

        this.logDebug(`🟢 Wi-Fi Handshake Success! Device: ${data.device_id || 'ESP32'} | IP: ${data.ip || this.espIp}`, 'success');
        window.StadiumApp.showToast(`Connected to ESP32 at ${this.espIp}!`, 'success');
        this.updateUiState(true);

        // Start live polling stream
        this.startPolling();

        // Optional WebSocket attempt (non-blocking)
        this.tryWebSocket();

        return true;
      } catch (err) {
        console.error('[WIFI_CONNECT] Error:', err);
        let errorMsg = `Unable to reach ESP32 at http://${this.espIp}.`;
        if (err.name === 'AbortError') {
          errorMsg = `Connection timed out. Check that ESP32 and PC are on the same Wi-Fi network.`;
        }

        this.logDebug(`🔴 ${errorMsg} (${err.message})`, 'error');
        this.logDebug(`Troubleshooting: 1. Verify ESP32 IP from Serial Monitor. 2. Ensure PC is on same Wi-Fi. 3. Disable client isolation if on college Wi-Fi.`, 'warning');
        window.StadiumApp.showToast(errorMsg, 'danger', 6000);
        this.handleDisconnect('Handshake failed');
        return false;
      }
    },

    // Polling loop for GET /api/sensors
    startPolling() {
      if (pollIntervalId) clearInterval(pollIntervalId);

      // Immediate first fetch
      this.fetchSensors();

      pollIntervalId = setInterval(() => {
        if (this.isConnected) {
          this.fetchSensors();
        }
      }, this.pollIntervalMs);
    },

    // Fetch single sensor packet via HTTP
    async fetchSensors() {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        const response = await fetch(`http://${this.espIp}/api/sensors`, {
          method: 'GET',
          mode: 'cors',
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const packet = await response.json();
        this.consecutiveFailures = 0;

        // Ingest into Sensor Fusion Service
        if (window.SensorService) {
          window.SensorService.processReading(packet, 'WIFI');
        }
      } catch (pollErr) {
        this.consecutiveFailures++;
        if (this.consecutiveFailures >= this.maxFailuresBeforeDisconnect) {
          this.logDebug(`Wi-Fi connection lost: ${this.consecutiveFailures} consecutive HTTP timeouts.`, 'error');
          this.handleDisconnect('Lost connection to ESP32');
        }
      }
    },

    // Try optional WebSocket connection on ws://<ip>/ws
    tryWebSocket() {
      try {
        const wsUrl = `ws://${this.espIp}/ws`;
        wsClient = new WebSocket(wsUrl);

        wsClient.onopen = () => {
          this.logDebug(`WebSocket link established on ${wsUrl}`, 'success');
        };

        wsClient.onmessage = (event) => {
          try {
            const packet = JSON.parse(event.data);
            if (window.SensorService) {
              window.SensorService.processReading(packet, 'WIFI');
            }
          } catch (e) {}
        };

        wsClient.onerror = () => {
          // Fall back gracefully to HTTP polling without noisy errors
        };
      } catch (e) {
        // WebSocket optional
      }
    },

    // Disconnect Wi-Fi link
    disconnect() {
      this.logDebug('Wi-Fi disconnect requested by user.', 'info');
      this.handleDisconnect('User disconnected');
    },

    // Teardown Wi-Fi state
    handleDisconnect(reason = 'Disconnected') {
      this.isConnected = false;
      if (pollIntervalId) {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
      }
      if (wsClient) {
        try { wsClient.close(); } catch (e) {}
        wsClient = null;
      }

      this.updateUiState(false);
      this.logDebug(`🔴 ESP32 Wi-Fi Link Closed: ${reason}`, 'warning');

      if (window.StadiumState && window.StadiumState.connectionMode === 'WIFI') {
        window.StadiumState.esp32Connected = false;
        window.StadiumState.connectionMode = 'NONE';
        window.StadiumApp.broadcastState('WIFI_DISCONNECTED');

        // Notify server
        const url = window.getApiUrl ? window.getApiUrl('/api/sensors/disconnect') : '/api/sensors/disconnect';
        fetch(url, { method: 'POST' }).catch(() => {});
      }
    },

    // Update UI controls
    updateUiState(connected) {
      const connectBtn = document.getElementById('wifi-connect-btn');
      const disconnectBtn = document.getElementById('wifi-disconnect-btn');
      const wifiStatusBadge = document.getElementById('wifi-status-indicator');

      if (connectBtn) connectBtn.disabled = connected;
      if (disconnectBtn) disconnectBtn.disabled = !connected;
      if (wifiStatusBadge) {
        if (connected) {
          wifiStatusBadge.innerHTML = '🟢 CONNECTED';
          wifiStatusBadge.className = 'status-badge status-connected';
        } else {
          wifiStatusBadge.innerHTML = '🔴 DISCONNECTED';
          wifiStatusBadge.className = 'status-badge status-disconnected';
        }
      }
    },

    // Log to shared debug console
    logDebug(message, type = 'info') {
      if (window.Esp32Serial && window.Esp32Serial.logDebug) {
        window.Esp32Serial.logDebug(`[Wi-Fi] ${message}`, type);
      }
    }
  };

  window.Esp32Wifi = Esp32Wifi;
})();

