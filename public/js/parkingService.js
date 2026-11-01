/**
 * StadiumSafe AI - Smart Parking Service
 * Manages parking slots, calculates availability rates, routes visitors to
 * nearest vacant spaces, and links hardware IR sensor to Lot A Slot 01.
 */

(function () {
  'use strict';

  const ParkingService = {
    lots: [],

    async init() {
      await this.fetchParking();
      // Listen for sensor updates to update IR slot live
      window.addEventListener('stadium:stateUpdated', (e) => {
        if (e.detail && e.detail.sensorData) {
          this.syncIrSensorSlot(e.detail.sensorData.ir_detected);
        }
      });
      window.addEventListener('stadium:parkingUpdated', (e) => {
        if (e.detail) {
          this.lots = e.detail;
          this.renderParking();
        }
      });
    },

    async fetchParking() {
      try {
        const url = window.getApiUrl ? window.getApiUrl('/api/parking') : '/api/parking';
        const res = await fetch(url);
        const data = await res.json();
        if (data.success && Array.isArray(data.lots)) {
          this.lots = data.lots;
          this.renderParking();
        }
      } catch (e) {
        console.warn('Could not fetch parking data:', e);
      }
    },

    // Reflect real IR sensor state onto Slot A-01
    syncIrSensorSlot(irDetected) {
      if (!this.lots || this.lots.length === 0) return;
      const lotA = this.lots.find(l => l.id === 'LOT-A');
      if (lotA && lotA.slots) {
        const slot1 = lotA.slots.find(s => s.id === 'A-01');
        if (slot1) {
          slot1.status = irDetected ? 'OCCUPIED' : 'AVAILABLE';
          slot1.isHardwareLinked = true;
          lotA.occupiedSlots = lotA.slots.filter(s => s.status === 'OCCUPIED').length;
          this.renderParking();
        }
      }
    },

    renderParking() {
      const container = document.getElementById('parking-lots-container');
      const totalAvailableEl = document.getElementById('total-available-slots');
      if (!container) return;

      let totalSlots = 0;
      let totalOccupied = 0;

      container.innerHTML = this.lots.map(lot => {
        totalSlots += lot.totalSlots;
        totalOccupied += lot.occupiedSlots;
        const available = lot.totalSlots - lot.occupiedSlots;
        const percent = Math.round((lot.occupiedSlots / lot.totalSlots) * 100);

        const slotsHtml = lot.slots.map(s => {
          const isOcc = s.status === 'OCCUPIED';
          const isHw = s.id === 'A-01' ? '<span class="hw-chip">ESP32 IR</span>' : '';
          const badgeClass = isOcc ? 'slot-occupied' : 'slot-available';

          return `
            <div class="parking-slot-card ${badgeClass}">
              <div class="slot-head">
                <span class="slot-id">${s.id}</span>
                ${isHw}
              </div>
              <div class="slot-status-icon">${isOcc ? '🚗' : '🟢'}</div>
              <div class="slot-status-text">${isOcc ? 'OCCUPIED' : 'VACANT'}</div>
              ${s.evCharging ? '<span class="amenity-pill">⚡ EV</span>' : ''}
              ${s.accessible ? '<span class="amenity-pill">♿ Acc</span>' : ''}
            </div>
          `;
        }).join('');

        return `
          <div class="parking-lot-card glass-panel">
            <div class="lot-header">
              <div>
                <h3 class="lot-name">${lot.name}</h3>
                <span class="lot-gate">Nearest Entry: <strong>${lot.nearestGate}</strong></span>
              </div>
              <div class="lot-stats">
                <span class="available-count">${available} / ${lot.totalSlots} Vacant</span>
                <div class="progress-bar-bg">
                  <div class="progress-bar-fill" style="width: ${percent}%;"></div>
                </div>
              </div>
            </div>
            <div class="slots-grid">
              ${slotsHtml}
            </div>
          </div>
        `;
      }).join('');

      if (totalAvailableEl) {
        totalAvailableEl.textContent = (totalSlots - totalOccupied).toString();
      }
    }
  };

  window.ParkingService = ParkingService;
  document.addEventListener('DOMContentLoaded', () => ParkingService.init());
})();

