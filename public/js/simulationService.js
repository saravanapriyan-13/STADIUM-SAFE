/**
 * StadiumSafe AI - Demo Simulation Engine
 * Provides synthetic scenario generation for college demonstrations
 * when physical ESP32 hardware is not connected.
 * 
 * STRICT RULE: If Real ESP32 is connected, real sensor telemetry has
 * absolute priority and will never be overwritten by simulation!
 */

(function () {
  'use strict';

  let demoInterval = null;

  const SimulationService = {
    isDemoActive: false,

    // Guard: Check if Real ESP32 is currently active
    checkRealHardwareGuard() {
      if (window.StadiumState && window.StadiumState.esp32Connected) {
        window.StadiumApp.showToast(
          'Real ESP32 is currently connected! Real sensor data takes priority over simulation.',
          'warning',
          4500
        );
        return true; // Blocked by real hardware
      }
      return false;
    },

    // Enable simulated demo mode
    startDemoMode() {
      if (this.checkRealHardwareGuard()) return;

      this.isDemoActive = true;
      const state = window.StadiumState;
      state.esp32Connected = false;
      state.connectionMode = 'DEMO';
      state.activeDeviceId = 'SIMULATOR-VIRTUAL-01';

      window.StadiumApp.showToast('Demo Simulation Mode Activated (Virtual Sensors)', 'info');

      // Baseline readings
      this.applyPacket({
        device: 'ESP32',
        device_id: 'SIMULATOR-VIRTUAL-01',
        zone: 'Entry Gate A',
        distance_cm: 115.0,
        flame: false,
        mq135_raw: 820,
        ir_detected: false,
        timestamp: Date.now()
      });
    },

    // 1. Simulate Crowd Surge
    simulateCrowdSurge() {
      if (this.checkRealHardwareGuard()) return;
      this.startDemoMode();

      window.StadiumApp.showToast('Simulating Rapid Crowd Surge at Entry Gate A...', 'warning');

      // Drop distance sharply to 18.5 cm and activate IR
      this.applyPacket({
        device: 'ESP32',
        device_id: 'SIMULATOR-VIRTUAL-01',
        zone: 'Entry Gate A',
        distance_cm: 18.5,
        flame: false,
        mq135_raw: 1250,
        ir_detected: true,
        timestamp: Date.now()
      });
    },

    // 2. Simulate Fire Outbreak
    simulateFire() {
      if (this.checkRealHardwareGuard()) return;
      this.startDemoMode();

      window.StadiumApp.showToast('🔥 Simulating Fire Outbreak at Entry Gate A!', 'danger');

      // Flame = true, high MQ135 smoke
      this.applyPacket({
        device: 'ESP32',
        device_id: 'SIMULATOR-VIRTUAL-01',
        zone: 'Entry Gate A',
        distance_cm: 45.0,
        flame: true,
        mq135_raw: 2850,
        ir_detected: true,
        timestamp: Date.now()
      });
    },

    // 3. Simulate Poor Air Quality / Smoke
    simulateAirQualityHazard() {
      if (this.checkRealHardwareGuard()) return;
      this.startDemoMode();

      window.StadiumApp.showToast('Simulating Elevated Smoke & Poor Air Quality...', 'warning');

      this.applyPacket({
        device: 'ESP32',
        device_id: 'SIMULATOR-VIRTUAL-01',
        zone: 'Entry Gate A',
        distance_cm: 95.0,
        flame: false,
        mq135_raw: 2450, // > 2000 is POOR
        ir_detected: false,
        timestamp: Date.now()
      });
    },

    // 4. Simulate IR Object Detection
    simulateIrDetection() {
      if (this.checkRealHardwareGuard()) return;
      this.startDemoMode();

      const nextState = !window.StadiumState.sensorData.ir_detected;
      window.StadiumApp.showToast(`Simulating IR Sensor: ${nextState ? 'OBJECT DETECTED' : 'CLEAR'}`, 'info');

      this.applyPacket({
        device: 'ESP32',
        device_id: 'SIMULATOR-VIRTUAL-01',
        zone: 'Entry Gate A',
        distance_cm: window.StadiumState.sensorData.distance_cm || 110.0,
        flame: false,
        mq135_raw: window.StadiumState.sensorData.mq135_raw || 800,
        ir_detected: nextState,
        timestamp: Date.now()
      });
    },

    // 5. Simulate Smart Parking Changes
    async simulateParkingChange() {
      try {
        const url = window.getApiUrl ? window.getApiUrl('/api/simulation/parking') : '/api/simulation/parking';
        const res = await fetch(url, { method: 'POST' });
        const data = await res.json();
        window.StadiumApp.showToast('Simulated parking occupancies randomized.', 'info');
        window.dispatchEvent(new CustomEvent('stadium:parkingUpdated', { detail: data.parkingLots }));
      } catch (e) {
        window.StadiumApp.showToast('Failed to reach parking simulation endpoint.', 'warning');
      }
    },

    // 6. Reset All Simulation Anomaly Overrides
    async resetSimulation() {
      if (this.checkRealHardwareGuard()) return;

      try {
        const url = window.getApiUrl ? window.getApiUrl('/api/simulation/reset') : '/api/simulation/reset';
        await fetch(url, { method: 'POST' });
      } catch (e) {}

      this.isDemoActive = false;
      const state = window.StadiumState;
      state.esp32Connected = false;
      state.connectionMode = 'NONE';
      state.emergency.active = false;
      state.emergency.type = null;
      window.StadiumApp.stopEmergencySiren();

      this.applyPacket({
        device: 'ESP32',
        device_id: 'STADIUMSAFE-ESP32-01',
        zone: 'Entry Gate A',
        distance_cm: 125.0,
        flame: false,
        mq135_raw: 780,
        ir_detected: false,
        timestamp: Date.now()
      });

      window.StadiumApp.showToast('Demo simulation reset. System returned to normal.', 'success');
    },

    // Apply packet to SensorService
    applyPacket(packet) {
      if (window.SensorService) {
        window.SensorService.processReading(packet, 'DEMO');
      }
    }
  };

  window.SimulationService = SimulationService;
})();

