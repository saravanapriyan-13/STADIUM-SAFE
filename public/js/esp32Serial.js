/**
 * StadiumSafe AI - Web Serial API Driver (Enhanced & Bulletproof)
 * Connects browser to ESP32 over USB COM serial port.
 * Uses direct stream reading with native TextDecoder, robust JSON extraction,
 * and comprehensive error diagnostics for Windows Arduino IDE port conflicts.
 */

(function () {
  'use strict';

  let currentPort = null;
  let keepReading = false;
  let reader = null;

  const Esp32Serial = {
    isConnected: false,
    baudRate: 115200,
    portInfo: null,
    lastPacketTime: null,
    totalPacketsReceived: 0,

    // Check if Web Serial API is supported in the current browser & context
    checkSupport() {
      if (window.location.protocol === 'file:') {
        return {
          supported: false,
          reason: 'FILE_PROTOCOL',
          message: 'The Web Serial API cannot run from a local file:// URL due to browser security restrictions.\n\nPlease open the site via http://localhost:3000 or VS Code Live Server in Google Chrome or Microsoft Edge.'
        };
      }

      if (!('serial' in navigator)) {
        return {
          supported: false,
          reason: 'NO_WEB_SERIAL',
          message: 'Web Serial is not supported in this browser.\n\nPlease open this website in Google Chrome, Microsoft Edge, or Opera on Windows or Mac.'
        };
      }

      return { supported: true };
    },

    isSupported() {
      return this.checkSupport().supported;
    },

    // Connect to ESP32 via Web Serial
    async connect(requestedBaud = 115200) {
      const support = this.checkSupport();
      if (!support.supported) {
        alert(support.message);
        if (window.StadiumApp && window.StadiumApp.showToast) {
          window.StadiumApp.showToast(support.message, 'danger', 7000);
        }
        return false;
      }

      this.baudRate = Number(requestedBaud) || 115200;

      try {
        console.log(`[WEB_SERIAL] Requesting port at ${this.baudRate} baud...`);
        // Prompt native browser COM port selector dialog
        currentPort = await navigator.serial.requestPort();

        console.log(`[WEB_SERIAL] Port selected. Opening port...`);
        await currentPort.open({
          baudRate: this.baudRate,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
          bufferSize: 8192
        });

        this.isConnected = true;
        keepReading = true;
        this.totalPacketsReceived = 0;

        // Extract USB VID & PID if available
        const info = currentPort.getInfo ? currentPort.getInfo() : {};
        this.portInfo = info;
        console.log(`[WEB_SERIAL] Connected! VendorID: ${info.usbVendorId}, ProductID: ${info.usbProductId}`);

        this.updateUiState(true);

        if (window.StadiumApp && window.StadiumApp.showToast) {
          window.StadiumApp.showToast('🟢 ESP32 COM Port Connected! Live telemetry streaming...', 'success', 4000);
        }

        // Listen for sudden physical USB cable unplug
        if (navigator.serial) {
          navigator.serial.addEventListener('disconnect', (event) => {
            if (event.port === currentPort) {
              console.warn('[WEB_SERIAL] Physical USB cable was disconnected.');
              this.handleDisconnect('USB cable removed');
            }
          });
        }

        // Start background reading loop (direct reader pattern, no pipeTo lock!)
        this.startDirectReadLoop();
        return true;

      } catch (err) {
        console.error('[WEB_SERIAL] Connection error:', err);

        let userMsg = '';
        if (err.name === 'NotFoundError') {
          // User cancelled the port selector popup
          console.log('[WEB_SERIAL] User cancelled port selection.');
          return false;
        } else if (err.name === 'NetworkError' || err.message.includes('busy') || err.message.includes('access denied') || err.message.includes('Failed to open')) {
          userMsg = '⚠️ COM Port is Busy or Locked!\n\n1. Close the Serial Monitor in Arduino IDE (Windows locks the port when Serial Monitor is open).\n2. If another app is using the COM port, close it.\n3. Unplug and re-plug your ESP32 USB cable, then click CONNECT COM again.';
        } else {
          userMsg = `Could not connect to ESP32:\n${err.message}\n\nMake sure the ESP32 is plugged in with a USB data cable and your CP2102/CH340 driver is installed.`;
        }

        alert(userMsg);
        if (window.StadiumApp && window.StadiumApp.showToast) {
          window.StadiumApp.showToast(userMsg, 'danger', 6000);
        }

        this.handleDisconnect('Failed to open port');
        return false;
      }
    },

    // Robust Direct Stream Reader (Prevents pipeTo stream locking bugs)
    async startDirectReadLoop() {
      const textDecoder = new TextDecoder();
      let buffer = '';

      try {
        reader = currentPort.readable.getReader();

        while (keepReading) {
          const { value, done } = await reader.read();
          if (done) {
            console.log('[WEB_SERIAL] Reader stream ended.');
            break;
          }

          if (value) {
            buffer += textDecoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            // Keep the last incomplete fragment in the buffer
            buffer = lines.pop();

            for (const line of lines) {
              this.handleIncomingLine(line);
            }
          }
        }
      } catch (readErr) {
        if (keepReading) {
          console.warn('[WEB_SERIAL] Stream read error:', readErr.message);
        }
      } finally {
        if (reader) {
          try { reader.releaseLock(); } catch (e) {}
          reader = null;
        }
      }

      if (keepReading) {
        this.handleDisconnect('Serial stream stopped');
      }
    },

    // Extract & Parse JSON safely from incoming serial line
    handleIncomingLine(line) {
      if (!line) return;

      // Extract JSON substring between outermost braces '{' and '}'
      const startIdx = line.indexOf('{');
      const endIdx = line.lastIndexOf('}');

      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        const jsonStr = line.substring(startIdx, endIdx + 1);

        try {
          const packet = JSON.parse(jsonStr);

          // Validate that packet has sensor data
          if (packet.distance_cm !== undefined || packet.flame !== undefined || packet.mq135_raw !== undefined || packet.ir_detected !== undefined) {
            this.lastPacketTime = Date.now();
            this.totalPacketsReceived++;

            // Pass real reading directly to SensorService
            if (window.SensorService && window.SensorService.processReading) {
              window.SensorService.processReading(packet, 'USB');
            }
          }
        } catch (jsonErr) {
          // Baud jitter or split packet, safely ignored
        }
      } else {
        // Raw boot or diagnostic messages
        const trimmed = line.trim();
        if (trimmed.length > 0) {
          console.log('[ESP32 RAW]', trimmed);
        }
      }
    },

    // Disconnect cleanly
    async disconnect() {
      keepReading = false;
      console.log('[WEB_SERIAL] Disconnect initiated by user.');

      try {
        if (reader) {
          await reader.cancel();
          reader.releaseLock();
          reader = null;
        }
        if (currentPort) {
          await currentPort.close();
          currentPort = null;
        }
      } catch (e) {
        console.warn('[WEB_SERIAL] Error closing port:', e);
      } finally {
        this.handleDisconnect('User disconnected');
      }
    },

    // Teardown state
    handleDisconnect(reason = 'Disconnected') {
      this.isConnected = false;
      keepReading = false;
      this.updateUiState(false);
      console.log(`[WEB_SERIAL] ESP32 Disconnected: ${reason}`);

      if (window.StadiumState) {
        window.StadiumState.esp32Connected = false;
        window.StadiumState.connectionMode = 'NONE';
        if (window.StadiumApp && window.StadiumApp.broadcastState) {
          window.StadiumApp.broadcastState('USB_DISCONNECTED');
        }

        // Notify server bridge
        const url = window.getApiUrl ? window.getApiUrl('/api/sensors/disconnect') : '/api/sensors/disconnect';
        fetch(url, { method: 'POST' }).catch(() => {});
      }
    },

    // Update all UI elements on both Mobile and Desktop views
    updateUiState(connected) {
      // Mobile Header Pill
      const mobilePill = document.getElementById('mobile-esp-pill');
      if (mobilePill) {
        mobilePill.className = `esp32-status-pill ${connected ? 'status-connected' : 'status-disconnected'}`;
        mobilePill.innerHTML = connected 
          ? '<span style="font-size:0.6rem;">🟢</span> ESP32: CONNECTED (115200)'
          : '<span style="font-size:0.6rem;">🔴</span> ESP32: OFFLINE';
      }

      // Desktop Navbar Pill
      const desktopPill = document.getElementById('desktop-esp-pill');
      if (desktopPill) {
        desktopPill.className = `esp32-status-pill ${connected ? 'status-connected' : 'status-disconnected'}`;
        desktopPill.innerHTML = connected 
          ? '<span style="font-size:0.6rem;">🟢</span> ESP32: CONNECTED (115200)'
          : '<span style="font-size:0.6rem;">🔴</span> ESP32: OFFLINE';
      }

      // Buttons
      const mobileBtn = document.getElementById('com-connect-btn');
      if (mobileBtn) {
        mobileBtn.textContent = connected ? '🔌 DISCONNECT' : '⚡ CONNECT COM';
      }

      const desktopBtn = document.getElementById('desktop-com-btn');
      if (desktopBtn) {
        desktopBtn.textContent = connected ? '🔌 DISCONNECT' : '⚡ CONNECT ESP32 COM';
      }

      // Hardware Data Badge
      const badgeTag = document.getElementById('hardware-data-badge');
      if (badgeTag) {
        if (connected) {
          badgeTag.textContent = '🟢 100% REAL HARDWARE DATA';
          badgeTag.style.background = '#dcfce7';
          badgeTag.style.color = '#15803d';
        } else {
          badgeTag.textContent = 'HARDWARE STANDBY';
          badgeTag.style.background = '#e2e8f0';
          badgeTag.style.color = '#64748b';
        }
      }
    }
  };

  window.Esp32Serial = Esp32Serial;
})();
