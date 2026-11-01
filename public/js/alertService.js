/**
 * StadiumSafe AI - Alert Management Service
 * Handles multi-tiered alarms, simulated control-room dispatch,
 * spectator SOS events, and audio alert triggers.
 */

(function () {
  'use strict';

  const AlertService = {
    alerts: [],

    init() {
      this.fetchAlerts();
      // Periodically refresh alerts from server
      setInterval(() => this.fetchAlerts(), 4000);
    },

    async fetchAlerts() {
      try {
        const url = window.getApiUrl ? window.getApiUrl('/api/alerts') : '/api/alerts';
        const res = await fetch(url);
        const data = await res.json();
        if (data.success && Array.isArray(data.alerts)) {
          this.alerts = data.alerts;
          this.renderAlerts();
        }
      } catch (e) {
        // Tolerated if backend is momentarily busy
      }
    },

    // Trigger Spectator Emergency SOS
    async triggerSos(seatId, issueType, details) {
      try {
        const url = window.getApiUrl ? window.getApiUrl('/api/sos') : '/api/sos';
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            seatId: seatId || 'General Spectator',
            zone: 'Stand Area',
            issueType: issueType || 'Medical Assistance',
            details: details || 'Visitor pressed SOS button from seat screen.'
          })
        });
        const data = await res.json();
        if (data.success) {
          window.StadiumApp.showToast('🚨 EMERGENCY SOS SENT! Security and Medical team have been notified.', 'danger', 6000);
          window.StadiumApp.playAlertBeep(920, 0.3);
          this.fetchAlerts();
          return true;
        }
      } catch (err) {
        window.StadiumApp.showToast('Failed to reach SOS server. Seek nearest physical usher.', 'danger');
        return false;
      }
    },

    // Render alerts list into DOM if alert container exists on current page
    renderAlerts() {
      const listContainer = document.getElementById('active-alerts-list');
      const badgeCount = document.getElementById('alerts-count-badge');
      if (!listContainer) return;

      const activeAlerts = this.alerts.filter(a => a.active);
      if (badgeCount) {
        badgeCount.textContent = activeAlerts.length;
        badgeCount.className = activeAlerts.length > 0 ? 'badge badge-danger' : 'badge badge-safe';
      }

      if (activeAlerts.length === 0) {
        listContainer.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon">🟢</span>
            <p>All stadium sectors report normal operating conditions. No active emergencies.</p>
          </div>
        `;
        return;
      }

      listContainer.innerHTML = activeAlerts.map(alert => {
        const levelClass = alert.level >= 5 ? 'alert-critical' : alert.level >= 4 ? 'alert-high' : alert.level >= 3 ? 'alert-warning' : 'alert-info';
        const icon = alert.type.includes('FIRE') ? '🔥' : alert.type.includes('SOS') ? '🚨' : alert.type.includes('AIR') ? '🌫️' : '⚠️';
        const formattedTime = new Date(alert.timestamp).toLocaleTimeString();

        return `
          <div class="alert-card ${levelClass} fade-in">
            <div class="alert-header">
              <span class="alert-icon">${icon}</span>
              <div class="alert-title-box">
                <h4 class="alert-title">${alert.title}</h4>
                <span class="alert-meta">Level ${alert.level} • ${alert.zone || 'Stadium Zone'} • ${formattedTime}</span>
              </div>
              <span class="alert-source-badge">${alert.source}</span>
            </div>
            <p class="alert-message">${alert.message}</p>
          </div>
        `;
      }).join('');
    }
  };

  window.AlertService = AlertService;
  document.addEventListener('DOMContentLoaded', () => AlertService.init());
})();

