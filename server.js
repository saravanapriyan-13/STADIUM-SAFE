/**
 * StadiumSafe AI - Backend Server
 * Express.js server providing local stadium API, simulation endpoints,
 * and ESP32 status / sync bridge.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Serve static frontend files from 'public'
app.use(express.static(path.join(__dirname, 'public')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Load initial stadium data
const dataFilePath = path.join(__dirname, 'data', 'stadiumData.json');
let stadiumData = {};
try {
  stadiumData = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
} catch (err) {
  console.error('[SERVER] Failed to load stadiumData.json:', err.message);
  stadiumData = { stadium: {}, zones: [], navigationGraph: { nodes: [], edges: [] }, parkingLots: [], sampleSeats: [] };
}

// In-memory runtime state
let runtimeState = {
  esp32Connected: false,
  connectionMode: 'NONE', // 'USB', 'WIFI', 'DEMO', 'NONE'
  lastDeviceSync: null,
  activeDeviceId: 'STADIUMSAFE-ESP32-01',
  sensorData: {
    distance_cm: null,
    flame: false,
    mq135_raw: null,
    ir_detected: false,
    timestamp: Date.now()
  },
  sensorZoneMapping: {
    'STADIUMSAFE-ESP32-01': 'Entry Gate A'
  },
  esp32Config: {
    targetIp: '192.168.1.100',
    baudRate: 115200,
    crowdThresholds: { low: 100, moderate: 50, critical: 25 },
    mq135Thresholds: { good: 1000, moderate: 2000 }
  },
  alerts: [
    {
      id: 'ALT-INIT-01',
      type: 'INFO',
      level: 1,
      source: 'SYSTEM',
      zone: 'All Gates',
      title: 'Stadium Safe AI Initialized',
      message: 'System running in local prototype mode. Ready for ESP32 sensor link or demo simulation.',
      timestamp: new Date().toISOString(),
      active: true
    }
  ],
  simulationOverrides: {
    active: false,
    fireZone: null,
    crowdSurgeZone: null,
    parkingLot: null
  }
};

// -------------------------------------------------------------
// CORE STADIUM APIS
// -------------------------------------------------------------

// GET /api/stadium - Overview of stadium status, capacity, occupancy
app.get('/api/stadium', (req, res) => {
  res.json({
    success: true,
    data: stadiumData.stadium,
    zonesCount: stadiumData.zones.length,
    runtime: {
      esp32Connected: runtimeState.esp32Connected,
      connectionMode: runtimeState.connectionMode,
      activeAlertsCount: runtimeState.alerts.filter(a => a.active).length
    }
  });
});

// GET /api/crowd - Real-time crowd density across stadium zones
app.get('/api/crowd', (req, res) => {
  // If ESP32 is mapped to Entry Gate A and connected, update Gate A density
  const zones = JSON.parse(JSON.stringify(stadiumData.zones));
  if (runtimeState.esp32Connected && runtimeState.sensorData.distance_cm !== null) {
    const gateAZone = zones.find(z => z.id === 'ZONE-GATE-A');
    if (gateAZone) {
      const dist = runtimeState.sensorData.distance_cm;
      let score = 35;
      if (dist < 25) score = 95;
      else if (dist < 50) score = 80;
      else if (dist < 100) score = 60;
      else score = 25;

      // Fusion with IR
      if (runtimeState.sensorData.ir_detected) {
        score = Math.min(100, score + 10);
      }

      gateAZone.densityScore = score;
      gateAZone.status = score >= 80 ? 'CRITICAL' : score >= 60 ? 'HIGH' : score >= 40 ? 'MODERATE' : 'LOW';
      gateAZone.source = 'REAL_ESP32_ULTRASONIC';
    }
  }

  res.json({
    success: true,
    totalOccupancy: stadiumData.stadium.totalCapacity,
    zones: zones,
    espZone: runtimeState.sensorZoneMapping['STADIUMSAFE-ESP32-01']
  });
});

// GET /api/parking - Status of smart parking lots and slots
app.get('/api/parking', (req, res) => {
  const parking = JSON.parse(JSON.stringify(stadiumData.parkingLots));
  // If IR sensor is linked to Lot A Slot 1
  if (runtimeState.esp32Connected && runtimeState.sensorData.ir_detected !== null) {
    const lotA = parking.find(p => p.id === 'LOT-A');
    if (lotA) {
      const slot1 = lotA.slots.find(s => s.id === 'A-01');
      if (slot1) {
        slot1.status = runtimeState.sensorData.ir_detected ? 'OCCUPIED' : 'AVAILABLE';
        slot1.source = 'REAL_ESP32_IR_SENSOR';
      }
      lotA.occupiedSlots = lotA.slots.filter(s => s.status === 'OCCUPIED').length;
    }
  }

  res.json({
    success: true,
    lots: parking
  });
});

// GET /api/alerts - Current active alerts & history
app.get('/api/alerts', (req, res) => {
  res.json({
    success: true,
    alerts: runtimeState.alerts
  });
});

// GET /api/status - Complete system status overview
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    system: 'StadiumSafe AI Core',
    version: '1.0.0-college-prototype',
    serverTime: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    esp32: {
      connected: runtimeState.esp32Connected,
      mode: runtimeState.connectionMode,
      deviceId: runtimeState.activeDeviceId,
      lastSync: runtimeState.lastDeviceSync,
      sensorData: runtimeState.sensorData
    },
    emergency: {
      active: runtimeState.alerts.some(a => a.active && a.level >= 4),
      fireDetected: runtimeState.sensorData.flame
    }
  });
});

// POST /api/sos - Trigger emergency SOS from spectator seat or security staff
app.post('/api/sos', (req, res) => {
  const { seatId, zone, issueType, details } = req.body;
  const newAlert = {
    id: `SOS-${Date.now()}`,
    type: 'SOS_EMERGENCY',
    level: 4,
    source: `SPECTATOR_SOS (${seatId || 'Unknown Seat'})`,
    zone: zone || 'Stand Area',
    title: `EMERGENCY SOS: ${issueType || 'General Medical/Assistance'}`,
    message: details || 'A visitor activated the SOS trigger. Security & Medical team dispatched.',
    timestamp: new Date().toISOString(),
    active: true
  };
  runtimeState.alerts.unshift(newAlert);

  console.log(`[SOS TRIGGERED] Seat: ${seatId}, Zone: ${zone}`);
  res.json({ success: true, message: 'SOS recorded and emergency alert raised.', alert: newAlert });
});

// -------------------------------------------------------------
// SIMULATION & DEMO CONTROLS
// -------------------------------------------------------------

// POST /api/simulation/crowd - Trigger synthetic crowd surge (only if ESP32 not connected)
app.post('/api/simulation/crowd', (req, res) => {
  if (runtimeState.esp32Connected) {
    return res.status(400).json({
      success: false,
      message: 'Real ESP32 is currently connected. Real sensor data has priority over simulation.'
    });
  }

  const { zoneId, score } = req.body;
  const targetZone = stadiumData.zones.find(z => z.id === (zoneId || 'ZONE-GATE-A'));
  if (targetZone) {
    targetZone.densityScore = score || 92;
    targetZone.status = 'CRITICAL';
  }

  const alert = {
    id: `SIM-CROWD-${Date.now()}`,
    type: 'WARNING',
    level: 3,
    source: 'SIMULATED DEMO CONTROL',
    zone: targetZone ? targetZone.name : 'Entry Gate A',
    title: 'Simulated Crowd Surge Warning',
    message: 'High density bottleneck simulated. Dynamic rerouting to Gate B recommended.',
    timestamp: new Date().toISOString(),
    active: true
  };
  runtimeState.alerts.unshift(alert);

  res.json({ success: true, message: 'Simulated crowd surge applied.', targetZone, alert });
});

// POST /api/simulation/parking - Randomize parking status for demo
app.post('/api/simulation/parking', (req, res) => {
  stadiumData.parkingLots.forEach(lot => {
    lot.slots.forEach(slot => {
      slot.status = Math.random() > 0.4 ? 'OCCUPIED' : 'AVAILABLE';
    });
    lot.occupiedSlots = lot.slots.filter(s => s.status === 'OCCUPIED').length;
  });

  res.json({ success: true, message: 'Simulated parking values updated.', parkingLots: stadiumData.parkingLots });
});

// POST /api/simulation/reset - Reset simulated anomalies and clear alerts
app.post('/api/simulation/reset', (req, res) => {
  // Reload fresh data from file
  try {
    stadiumData = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
  } catch (e) {}

  // Keep only system init alert
  runtimeState.alerts = [
    {
      id: 'ALT-RESET-01',
      type: 'INFO',
      level: 1,
      source: 'SYSTEM',
      zone: 'All Gates',
      title: 'Simulation & Alerts Reset',
      message: 'All simulated hazards cleared. Stadium operating normally.',
      timestamp: new Date().toISOString(),
      active: true
    }
  ];

  if (!runtimeState.esp32Connected) {
    runtimeState.sensorData = {
      distance_cm: null,
      flame: false,
      mq135_raw: null,
      ir_detected: false,
      timestamp: Date.now()
    };
    runtimeState.connectionMode = 'NONE';
  }

  res.json({ success: true, message: 'All simulation overrides and alerts reset.' });
});

// -------------------------------------------------------------
// ESP32 STATUS & SENSOR SYNC ENDPOINTS
// -------------------------------------------------------------

// GET /api/esp32/status - Current ESP32 link status and last readings
app.get('/api/esp32/status', (req, res) => {
  res.json({
    success: true,
    connected: runtimeState.esp32Connected,
    mode: runtimeState.connectionMode,
    deviceId: runtimeState.activeDeviceId,
    lastSync: runtimeState.lastDeviceSync,
    sensorData: runtimeState.sensorData,
    config: runtimeState.esp32Config
  });
});

// POST /api/esp32/config - Update ESP32 connection parameters
app.post('/api/esp32/config', (req, res) => {
  const { targetIp, baudRate, zoneMapping } = req.body;
  if (targetIp) runtimeState.esp32Config.targetIp = targetIp;
  if (baudRate) runtimeState.esp32Config.baudRate = Number(baudRate);
  if (zoneMapping) runtimeState.sensorZoneMapping = { ...runtimeState.sensorZoneMapping, ...zoneMapping };

  res.json({
    success: true,
    message: 'ESP32 configuration updated.',
    config: runtimeState.esp32Config,
    zoneMapping: runtimeState.sensorZoneMapping
  });
});

// POST /api/sensors/sync - Bridge endpoint called by browser Web Serial or WiFi client to sync real readings into server state
app.post('/api/sensors/sync', (req, res) => {
  const { mode, device_id, distance_cm, flame, mq135_raw, ir_detected, timestamp } = req.body;

  runtimeState.esp32Connected = true;
  runtimeState.connectionMode = mode || 'USB';
  runtimeState.activeDeviceId = device_id || 'STADIUMSAFE-ESP32-01';
  runtimeState.lastDeviceSync = new Date().toISOString();

  const prevFlame = runtimeState.sensorData.flame;

  runtimeState.sensorData = {
    distance_cm: typeof distance_cm === 'number' ? distance_cm : runtimeState.sensorData.distance_cm,
    flame: Boolean(flame),
    mq135_raw: typeof mq135_raw === 'number' ? mq135_raw : runtimeState.sensorData.mq135_raw,
    ir_detected: Boolean(ir_detected),
    timestamp: timestamp || Date.now()
  };

  // Automated emergency escalation if flame is detected
  if (runtimeState.sensorData.flame && !prevFlame) {
    const fireAlert = {
      id: `FIRE-${Date.now()}`,
      type: 'FIRE_EMERGENCY',
      level: 5,
      source: `${runtimeState.activeDeviceId} (Flame Sensor)`,
      zone: runtimeState.sensorZoneMapping[runtimeState.activeDeviceId] || 'Entry Gate A',
      title: 'CRITICAL FIRE DETECTED!',
      message: 'Flame detected by real ESP32 hardware! Automated evacuation protocol initiated. Zone marked HAZARDOUS.',
      timestamp: new Date().toISOString(),
      active: true
    };
    runtimeState.alerts.unshift(fireAlert);
    console.warn(`[EMERGENCY TRIGGER] Real flame detected by ${runtimeState.activeDeviceId} in ${fireAlert.zone}!`);
  }

  // Air quality escalation if MQ135 is poor (> 2000)
  if (runtimeState.sensorData.mq135_raw > runtimeState.esp32Config.mq135Thresholds.moderate) {
    const existing = runtimeState.alerts.find(a => a.type === 'AIR_QUALITY_WARNING' && a.active);
    if (!existing) {
      runtimeState.alerts.unshift({
        id: `AQ-${Date.now()}`,
        type: 'AIR_QUALITY_WARNING',
        level: 3,
        source: `${runtimeState.activeDeviceId} (MQ135)`,
        zone: runtimeState.sensorZoneMapping[runtimeState.activeDeviceId] || 'Entry Gate A',
        title: 'Poor Air Quality Warning',
        message: `Elevated MQ135 sensor raw reading: ${runtimeState.sensorData.mq135_raw}. Relative air quality POOR.`,
        timestamp: new Date().toISOString(),
        active: true
      });
    }
  }

  res.json({
    success: true,
    serverReceived: true,
    state: {
      connected: true,
      mode: runtimeState.connectionMode,
      activeAlerts: runtimeState.alerts.filter(a => a.active).length
    }
  });
});

// POST /api/sensors/disconnect - Notifies server that browser disconnected ESP32
app.post('/api/sensors/disconnect', (req, res) => {
  runtimeState.esp32Connected = false;
  runtimeState.connectionMode = 'NONE';
  res.json({ success: true, message: 'ESP32 marked as disconnected on server.' });
});

// Start Express Server
app.listen(PORT, () => {
  console.log('====================================================');
  console.log('   STADIUMSAFE AI - SMART CROWD & SENSOR SYSTEM    ');
  console.log('====================================================');
  console.log(`[SERVER] Running at: http://localhost:${PORT}`);
  console.log(`[SERVER] Dashboard:  http://localhost:${PORT}/dashboard.html`);
  console.log(`[SERVER] Sensors UI: http://localhost:${PORT}/sensors.html`);
  console.log(`[SERVER] Ready for Web Serial USB & WiFi Connections`);
  console.log('====================================================');
});

