/**
 * StadiumSafe AI - Central Application Core
 * Manages global stadium state, UI synchronization, cross-tab events,
 * and audio alarm synthesis.
 */

(function () {
  'use strict';

  // Helper to dynamically route API requests to Express server (port 3000)
  // even if running on VS Code Live Server (port 5500, etc.)
  window.getApiUrl = function (endpoint) {
    if (window.location.port && window.location.port !== '3000') {
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
      return `http://localhost:3000${cleanEndpoint}`;
    }
    return endpoint;
  };

  // 1. Central Global Stadium State
  const StadiumState = {
    // Hardware link status
    esp32Connected: false,
    connectionMode: 'NONE', // 'USB', 'WIFI', 'DEMO', 'NONE'
    activeDeviceId: 'STADIUMSAFE-ESP32-01',
    lastUpdateTimestamp: null,
    isWarningStale: false,

    // Real or current sensor readings
    sensorData: {
      distance_cm: 120.0,
      flame: false,
      mq135_raw: 850,
      ir_detected: false,
      timestamp: Date.now()
    },

    // Sensor Fusion Metrics
    fusion: {
      crowdLevel: 'LOW',
      crowdScore: 22,
      airQuality: 'GOOD',
      fireEmergency: false,
      zone: 'Entry Gate A'
    },

    // Stadium metadata
    stadium: {
      name: 'Metropolis National Stadium',
      capacity: 65000,
      occupancy: 42180,
      status: 'NORMAL'
    },

    // Emergency System
    emergency: {
      active: false,
      type: null,
      source: null,
      level: 1,
      zone: null,
      message: null
    },

    // Preferences & Config
    config: {
      zoneMapping: {
        'STADIUMSAFE-ESP32-01': 'Entry Gate A'
      },
      thresholds: {
        ultrasonic: { low: 100, moderate: 50, critical: 25 },
        mq135: { good: 1000, moderate: 2000 }
      }
    }
  };

  window.StadiumState = StadiumState;

  // Cross-tab broadcast channel for multi-page real-time synchronization
  const broadcastChannel = typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('stadiumsafe_sync_channel')
    : null;

  // Audio Context for emergency alarm beeper
  let audioCtx = null;
  let alarmInterval = null;

  function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
  }

  function playAlertBeep(freq = 880, duration = 0.15) {
    try {
      initAudio();
      if (!audioCtx) return;
      if (audioCtx.state === 'suspended') audioCtx.resume();

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      console.warn('Audio alert not allowed yet:', e.message);
    }
  }

  function startEmergencySiren() {
    if (alarmInterval) return;
    initAudio();
    playAlertBeep(980, 0.25);
    alarmInterval = setInterval(() => {
      if (StadiumState.emergency.active) {
        playAlertBeep(980, 0.25);
        setTimeout(() => playAlertBeep(650, 0.25), 300);
      } else {
        stopEmergencySiren();
      }
    }, 1200);
  }

  function stopEmergencySiren() {
    if (alarmInterval) {
      clearInterval(alarmInterval);
      alarmInterval = null;
    }
  }

  // 2. Broadcast State Update
  function broadcastState(sourceType = 'LOCAL_UPDATE') {
    const payload = {
      type: 'STATE_SYNC',
      source: sourceType,
      state: {
        esp32Connected: StadiumState.esp32Connected,
        connectionMode: StadiumState.connectionMode,
        activeDeviceId: StadiumState.activeDeviceId,
        lastUpdateTimestamp: StadiumState.lastUpdateTimestamp,
        sensorData: StadiumState.sensorData,
        fusion: StadiumState.fusion,
        emergency: StadiumState.emergency
      }
    };

    if (broadcastChannel) {
      broadcastChannel.postMessage(payload);
    }

    try {
      localStorage.setItem('stadiumsafe_last_state', JSON.stringify(payload.state));
    } catch (e) {}

    // Dispatch locally
    window.dispatchEvent(new CustomEvent('stadium:stateUpdated', { detail: payload.state }));
    updateHeaderStatusBar();
  }

  // Listen for Broadcast from other tabs
  if (broadcastChannel) {
    broadcastChannel.onmessage = (event) => {
      if (event.data && event.data.type === 'STATE_SYNC') {
        const synced = event.data.state;
        StadiumState.esp32Connected = synced.esp32Connected;
        StadiumState.connectionMode = synced.connectionMode;
        StadiumState.activeDeviceId = synced.activeDeviceId;
        StadiumState.lastUpdateTimestamp = synced.lastUpdateTimestamp;
        StadiumState.sensorData = synced.sensorData;
        StadiumState.fusion = synced.fusion;
        StadiumState.emergency = synced.emergency;

        if (StadiumState.emergency.active) {
          startEmergencySiren();
        } else {
          stopEmergencySiren();
        }

        window.dispatchEvent(new CustomEvent('stadium:stateUpdated', { detail: synced }));
        updateHeaderStatusBar();
      }
    };
  }

  // 3. UI Header Status Bar Synchronization
  function updateHeaderStatusBar() {
    const statusEl = document.getElementById('global-esp-status');
    const modeEl = document.getElementById('global-esp-mode');
    const dataBadgeEl = document.getElementById('global-data-badge');
    const emergencyBadgeEl = document.getElementById('global-emergency-badge');
    const emergencyBannerEl = document.getElementById('global-emergency-banner');

    if (statusEl) {
      if (StadiumState.esp32Connected) {
        statusEl.innerHTML = `<span class="indicator-dot dot-green"></span> CONNECTED (${StadiumState.activeDeviceId})`;
        statusEl.className = 'status-pill status-pill-connected';
      } else if (StadiumState.connectionMode === 'DEMO') {
        statusEl.innerHTML = `<span class="indicator-dot dot-yellow"></span> DEMO SIMULATION`;
        statusEl.className = 'status-pill status-pill-demo';
      } else {
        statusEl.innerHTML = `<span class="indicator-dot dot-red"></span> ESP32 DISCONNECTED`;
        statusEl.className = 'status-pill status-pill-disconnected';
      }
    }

    if (modeEl) {
      if (StadiumState.connectionMode === 'USB') {
        modeEl.textContent = 'USB / SERIAL';
      } else if (StadiumState.connectionMode === 'WIFI') {
        modeEl.textContent = 'WI-FI HTTP';
      } else if (StadiumState.connectionMode === 'DEMO') {
        modeEl.textContent = 'DEMO MODE';
      } else {
        modeEl.textContent = 'STANDBY';
      }
    }

    if (dataBadgeEl) {
      if (StadiumState.esp32Connected) {
        dataBadgeEl.textContent = 'LIVE ESP32';
        dataBadgeEl.className = 'badge badge-success';
      } else if (StadiumState.connectionMode === 'DEMO') {
        dataBadgeEl.textContent = 'DEMO DATA';
        dataBadgeEl.className = 'badge badge-warning';
      } else {
        dataBadgeEl.textContent = 'OFFLINE';
        dataBadgeEl.className = 'badge badge-muted';
      }
    }

    if (emergencyBadgeEl) {
      if (StadiumState.emergency.active) {
        emergencyBadgeEl.innerHTML = '🚨 EMERGENCY ACTIVE';
        emergencyBadgeEl.className = 'badge badge-danger blink-fast';
      } else {
        emergencyBadgeEl.innerHTML = '🟢 ALL SAFE';
        emergencyBadgeEl.className = 'badge badge-safe';
      }
    }

    if (emergencyBannerEl) {
      if (StadiumState.emergency.active) {
        emergencyBannerEl.classList.remove('hidden');
        emergencyBannerEl.innerHTML = `
          <div class="emergency-banner-content">
            <span class="emergency-icon">🔥</span>
            <div>
              <strong>${StadiumState.emergency.type || 'CRITICAL ALERT'}:</strong>
              ${StadiumState.emergency.message || 'Possible threat detected in monitored stadium zone.'}
              <span class="emergency-zone">[Affected: ${StadiumState.emergency.zone || 'Entry Gate A'}]</span>
            </div>
            <a href="emergency.html" class="btn btn-sm btn-danger">VIEW RESPONSE PROTOCOL</a>
          </div>
        `;
      } else {
        emergencyBannerEl.classList.add('hidden');
      }
    }
  }

  // 4. Stale Data Watchdog (Warns after 5s, Marks Disconnected after 15s)
  setInterval(() => {
    if (!StadiumState.esp32Connected) return;
    if (!StadiumState.lastUpdateTimestamp) return;

    const secondsAgo = (Date.now() - StadiumState.lastUpdateTimestamp) / 1000;
    if (secondsAgo >= 15) {
      console.warn(`[WATCHDOG] No sensor data for ${secondsAgo.toFixed(1)}s. Marking disconnected.`);
      StadiumState.esp32Connected = false;
      StadiumState.isWarningStale = false;
      broadcastState('WATCHDOG_DISCONNECT');
    } else if (secondsAgo >= 5) {
      if (!StadiumState.isWarningStale) {
        StadiumState.isWarningStale = true;
        console.warn(`[WATCHDOG] Warning: Sensor data stale (${secondsAgo.toFixed(1)}s ago).`);
        broadcastState('WATCHDOG_STALE_WARNING');
      }
    } else {
      StadiumState.isWarningStale = false;
    }
  }, 1000);

  // 5. Toast Notification System
  function showToast(message, type = 'info', duration = 3500) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type} fade-in`;
    const icon = type === 'danger' ? '⚠️' : type === 'success' ? '✅' : type === 'warning' ? '⚡' : 'ℹ️';
    toast.innerHTML = `<span class="toast-icon">${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 400);
    }, duration);
  }

  // Restore cached state on initial page load
  try {
    const cached = localStorage.getItem('stadiumsafe_last_state');
    if (cached) {
      const parsed = JSON.parse(cached);
      Object.assign(StadiumState, parsed);
    }
  } catch (e) {}

  document.addEventListener('DOMContentLoaded', () => {
    updateHeaderStatusBar();
    // Allow user click to unlock AudioContext
    document.addEventListener('click', () => initAudio(), { once: true });
  });

  // Public export
  window.StadiumApp = {
    state: StadiumState,
    broadcastState,
    updateHeaderStatusBar,
    showToast,
    playAlertBeep,
    startEmergencySiren,
    stopEmergencySiren
  };
})();

