/**
 * StadiumSafe AI - Sensor Fusion Service
 * Ingests raw telemetry from ESP32 (Web Serial or Wi-Fi), validates packets,
 * computes crowd density estimates, classifies air quality, and triggers
 * automated multi-tier emergency protocols.
 */

(function () {
  'use strict';

  const SensorService = {
    // Configurable thresholds
    thresholds: {
      distance: {
        critical: 25,   // < 25 cm: Critical crowd density
        high: 50,       // 25 - 50 cm: High crowd density
        moderate: 100   // 50 - 100 cm: Moderate; > 100 cm: Low
      },
      mq135: {
        goodMax: 1000,
        moderateMax: 2000
      }
    },

    // Zone mapping for device IDs
    deviceZoneMap: {
      'STADIUMSAFE-ESP32-01': 'Entry Gate A',
      'ESP32': 'Entry Gate A'
    },

    // Ingest and fuse real sensor readings
    processReading(packet, sourceMode = 'USB') {
      if (!packet || typeof packet !== 'object') {
        console.warn('[SENSOR_SERVICE] Discarding invalid packet:', packet);
        return null;
      }

      // Validate required sensor fields
      const deviceId = packet.device_id || packet.device || 'STADIUMSAFE-ESP32-01';
      const distance = typeof packet.distance_cm === 'number' ? Math.max(0, packet.distance_cm) : 100.0;
      const flame = Boolean(packet.flame);
      const mq135 = typeof packet.mq135_raw === 'number' ? Math.max(0, packet.mq135_raw) : 800;
      const ir = Boolean(packet.ir_detected);
      const timestamp = packet.timestamp || Date.now();
      const zone = packet.zone || this.deviceZoneMap[deviceId] || 'Entry Gate A';

      // 1. Calculate Crowd Density from Ultrasonic Distance
      let distanceScore = 20;
      let densityLevel = 'LOW';

      if (distance > 0) {
        if (distance < this.thresholds.distance.critical) {
          distanceScore = 95;
          densityLevel = 'CRITICAL';
        } else if (distance < this.thresholds.distance.high) {
          // Linear scale between 25 and 50 cm -> score 85 to 65
          const ratio = (this.thresholds.distance.high - distance) / (this.thresholds.distance.high - this.thresholds.distance.critical);
          distanceScore = Math.round(65 + ratio * 20);
          densityLevel = 'HIGH';
        } else if (distance < this.thresholds.distance.moderate) {
          // Linear scale between 50 and 100 cm -> score 60 to 35
          const ratio = (this.thresholds.distance.moderate - distance) / (this.thresholds.distance.moderate - this.thresholds.distance.high);
          distanceScore = Math.round(35 + ratio * 25);
          densityLevel = 'MODERATE';
        } else {
          distanceScore = Math.max(10, Math.round(35 - (distance - 100) * 0.15));
          densityLevel = 'LOW';
        }
      }

      // 2. Sensor Fusion with IR Obstacle Sensor (70% distance + 30% IR object presence)
      const irScore = ir ? 90 : 15;
      const combinedCrowdScore = Math.min(100, Math.max(5, Math.round(distanceScore * 0.7 + irScore * 0.3)));

      if (combinedCrowdScore >= 80) densityLevel = 'CRITICAL';
      else if (combinedCrowdScore >= 60) densityLevel = 'HIGH';
      else if (combinedCrowdScore >= 40) densityLevel = 'MODERATE';
      else densityLevel = 'LOW';

      // 3. Classify Air Quality (Relative MQ135 Raw ADC)
      let airQualityStatus = 'GOOD';
      if (mq135 > this.thresholds.mq135.moderateMax) {
        airQualityStatus = 'POOR';
      } else if (mq135 > this.thresholds.mq135.goodMax) {
        airQualityStatus = 'MODERATE';
      }

      // 4. Update Global Stadium State
      const state = window.StadiumState;
      state.esp32Connected = true;
      state.connectionMode = sourceMode;
      state.activeDeviceId = deviceId;
      state.lastUpdateTimestamp = Date.now();
      state.sensorData = {
        distance_cm: distance,
        flame: flame,
        mq135_raw: mq135,
        ir_detected: ir,
        timestamp: timestamp
      };

      state.fusion = {
        crowdScore: combinedCrowdScore,
        crowdLevel: densityLevel,
        airQuality: airQualityStatus,
        fireEmergency: flame,
        zone: zone
      };

      // 5. Automated Emergency Escalation Workflow (Flame OR MQ-135 >= 3000)
      const isFire = Boolean(flame);
      const isGasHazard = (typeof mq135 === 'number' && mq135 >= 3000);

      if (isFire || isGasHazard) {
        const wasActive = state.emergency.active;
        const alertType = isFire ? 'FIRE EMERGENCY' : 'TOXIC GAS / SMOKE HAZARD';
        const alertSource = isFire ? `${deviceId} (Flame Sensor)` : `${deviceId} (MQ135 Gas Sensor)`;
        const alertMsg = isFire
          ? `🔥 FIRE DETECTED at ${zone}! Real infrared flame sensor triggered. Immediate evacuation via Alternate Gates recommended.`
          : `⚠️ DANGEROUS GAS/SMOKE DETECTED at ${zone}! MQ-135 level: ${mq135} (Threshold 3000 exceeded). Evacuate to open concourse!`;

        state.emergency = {
          active: true,
          type: alertType,
          level: 5,
          source: alertSource,
          zone: zone,
          message: alertMsg
        };

        if (!wasActive) {
          window.StadiumApp.startEmergencySiren();
          window.StadiumApp.showToast(`🚨 CRITICAL: ${alertType} AT ${zone.toUpperCase()}!`, 'danger', 6000);
          console.error(`[EMERGENCY] Automated Emergency Protocol engaged for ${zone}! Type: ${alertType}`);
        }
      } else if (state.emergency.active && state.emergency.source && (state.emergency.source.includes('Flame Sensor') || state.emergency.source.includes('MQ135 Gas Sensor'))) {
        // Hazards cleared
        state.emergency.active = false;
        state.emergency.type = null;
        window.StadiumApp.stopEmergencySiren();
        window.StadiumApp.showToast(`Environmental hazards cleared at ${zone}. Air quality & optical sensors safe.`, 'success', 3000);
      }

      // 6. Broadcast state to other tabs & update UI
      window.StadiumApp.broadcastState('REAL_SENSOR_PACKET');

      // 7. Non-blocking sync to backend server
      this.syncToServer({
        mode: sourceMode,
        device_id: deviceId,
        distance_cm: distance,
        flame: flame,
        mq135_raw: mq135,
        ir_detected: ir,
        timestamp: timestamp
      });

      return state.fusion;
    },

    // Sync real sensor packet to local Express server
    async syncToServer(data) {
      try {
        const url = window.getApiUrl ? window.getApiUrl('/api/sensors/sync') : '/api/sensors/sync';
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      } catch (e) {
        // Silently tolerate if backend is unreachable or busy
      }
    }
  };

  window.SensorService = SensorService;
})();

