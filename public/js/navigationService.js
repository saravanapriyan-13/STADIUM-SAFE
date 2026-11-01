/**
 * StadiumSafe AI - Indoor Navigation & Dynamic Rerouting Engine
 * Graph-based indoor pathfinding using Dijkstra's Algorithm with dynamic
 * hazard avoidance (e.g. fire or severe bottleneck at Entry Gate A).
 */

(function () {
  'use strict';

  const NavigationService = {
    // Default Stadium Nodes
    nodes: [
      { id: 'GATE_A', name: 'Entry Gate A (ESP32 Monitored)', x: 120, y: 380, type: 'gate', zoneName: 'Entry Gate A' },
      { id: 'STAND_A', name: 'West Stand (Sec 101-115)', x: 260, y: 380, type: 'stand', zoneName: 'West Stand' },
      { id: 'CONCOURSE_N', name: 'North Main Concourse', x: 500, y: 190, type: 'concourse', zoneName: 'North Concourse' },
      { id: 'FOOD_COURT', name: 'Food & Beverage Plaza', x: 500, y: 380, type: 'amenity', zoneName: 'Food Court' },
      { id: 'CONCOURSE_S', name: 'South Concourse (Gate C)', x: 500, y: 570, type: 'concourse', zoneName: 'South Concourse' },
      { id: 'STAND_B', name: 'East Stand (Sec 116-130)', x: 740, y: 380, type: 'stand', zoneName: 'East Stand' },
      { id: 'GATE_B', name: 'Entry Gate B', x: 880, y: 380, type: 'gate', zoneName: 'Entry Gate B' },
      { id: 'EMERGENCY_NW', name: 'Emergency Exit North-West', x: 160, y: 140, type: 'exit', zoneName: 'Exit NW' },
      { id: 'EMERGENCY_NE', name: 'Emergency Exit North-East', x: 840, y: 140, type: 'exit', zoneName: 'Exit NE' }
    ],

    // Physical Walkway Graph Edges (with distances in meters)
    edges: [
      { from: 'GATE_A', to: 'STAND_A', distance: 45 },
      { from: 'GATE_A', to: 'EMERGENCY_NW', distance: 60 },
      { from: 'STAND_A', to: 'CONCOURSE_N', distance: 70 },
      { from: 'STAND_A', to: 'FOOD_COURT', distance: 55 },
      { from: 'STAND_A', to: 'CONCOURSE_S', distance: 75 },
      { from: 'CONCOURSE_N', to: 'EMERGENCY_NW', distance: 50 },
      { from: 'CONCOURSE_N', to: 'EMERGENCY_NE', distance: 50 },
      { from: 'CONCOURSE_N', to: 'FOOD_COURT', distance: 40 },
      { from: 'FOOD_COURT', to: 'STAND_B', distance: 55 },
      { from: 'FOOD_COURT', to: 'CONCOURSE_S', distance: 45 },
      { from: 'STAND_B', to: 'GATE_B', distance: 45 },
      { from: 'STAND_B', to: 'EMERGENCY_NE', distance: 65 },
      { from: 'STAND_B', to: 'CONCOURSE_N', distance: 70 },
      { from: 'STAND_B', to: 'CONCOURSE_S', distance: 75 },
      { from: 'GATE_B', to: 'EMERGENCY_NE', distance: 60 }
    ],

    // Check if a node is currently hazardous (fire or extreme bottleneck)
    isNodeHazardous(nodeId) {
      const state = window.StadiumState;
      if (!state) return false;

      // If Gate A has active fire detected by ESP32 or simulated
      if (nodeId === 'GATE_A') {
        if (state.emergency.active && (state.emergency.zone === 'Entry Gate A' || state.fusion.fireEmergency)) {
          return true;
        }
        if (state.fusion && state.fusion.crowdLevel === 'CRITICAL') {
          return true;
        }
      }
      return false;
    },

    // Dijkstra's Shortest Path Algorithm with dynamic avoidance
    findPath(startId, endId) {
      if (!startId || !endId) return null;
      if (startId === endId) {
        const node = this.nodes.find(n => n.id === startId);
        return { path: [startId], distance: 0, steps: [`You are already at ${node ? node.name : startId}.`], rerouted: false };
      }

      const blockedNodes = new Set();
      this.nodes.forEach(n => {
        if (this.isNodeHazardous(n.id)) {
          blockedNodes.add(n.id);
        }
      });

      let rerouted = false;
      // If start or destination is directly in the hazard zone, notify user
      if (blockedNodes.has(startId)) {
        rerouted = true;
      }
      if (blockedNodes.has(endId)) {
        rerouted = true;
      }

      // Build adjacency list
      const adj = {};
      this.nodes.forEach(n => { adj[n.id] = []; });
      this.edges.forEach(e => {
        // Calculate penalty if edge touches a hazardous node
        let weight = e.distance;
        if (blockedNodes.has(e.from) || blockedNodes.has(e.to)) {
          weight = 999999; // Extreme penalty to force alternate detour
        }
        adj[e.from].push({ to: e.to, weight });
        adj[e.to].push({ to: e.from, weight });
      });

      // Dijkstra
      const distances = {};
      const previous = {};
      const unvisited = new Set();

      this.nodes.forEach(n => {
        distances[n.id] = Infinity;
        previous[n.id] = null;
        unvisited.add(n.id);
      });

      distances[startId] = 0;

      while (unvisited.size > 0) {
        let current = null;
        let smallestDist = Infinity;

        for (const nodeId of unvisited) {
          if (distances[nodeId] < smallestDist) {
            smallestDist = distances[nodeId];
            current = nodeId;
          }
        }

        if (current === null || smallestDist === Infinity) break;
        if (current === endId) break;

        unvisited.delete(current);

        for (const neighbor of adj[current]) {
          if (!unvisited.has(neighbor.to)) continue;
          const alt = distances[current] + neighbor.weight;
          if (alt < distances[neighbor.to]) {
            distances[neighbor.to] = alt;
            previous[neighbor.to] = current;
          }
        }
      }

      // Reconstruct path
      const path = [];
      let curr = endId;
      while (curr !== null) {
        path.unshift(curr);
        curr = previous[curr];
      }

      if (path.length === 0 || path[0] !== startId) {
        return {
          path: [],
          distance: 0,
          steps: ['No safe route available due to emergency blockades! Follow stadium evacuation wardens immediately.'],
          rerouted: true
        };
      }

      // Compute actual walk distance (ignoring penalty weights)
      let actualDistance = 0;
      for (let i = 0; i < path.length - 1; i++) {
        const edge = this.edges.find(e =>
          (e.from === path[i] && e.to === path[i + 1]) ||
          (e.from === path[i + 1] && e.to === path[i])
        );
        if (edge) actualDistance += edge.distance;
      }

      // Generate turn-by-turn steps
      const steps = [];
      for (let i = 0; i < path.length; i++) {
        const nodeObj = this.nodes.find(n => n.id === path[i]);
        if (i === 0) {
          steps.push(`Start at ${nodeObj.name}`);
        } else if (i === path.length - 1) {
          steps.push(`Arrive safely at your destination: ${nodeObj.name}`);
        } else {
          steps.push(`Proceed through ${nodeObj.name}`);
        }
      }

      if (blockedNodes.size > 0 && !path.includes('GATE_A')) {
        rerouted = true;
      }

      return {
        path,
        distance: actualDistance,
        steps,
        rerouted
      };
    }
  };

  window.NavigationService = NavigationService;
})();

