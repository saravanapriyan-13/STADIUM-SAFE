/**
 * StadiumSafe AI - Indoor Navigation & Dynamic Rerouting Engine
 * Realistic Stadium Blueprint Topology with Dijkstra Shortest Path &
 * Dynamic Multi-Hazard Emergency Evacuation to Nearest Safe Exit.
 */

(function () {
  'use strict';

  const NavigationService = {
    // Exact Node Coordinates perfectly aligned with the architectural concourses (zero grass cutting!)
    nodes: [
      // Entrances & Exits
      { id: 'GATE_1', name: 'Gate 1 (Entry Gate A - ESP32 Monitored)', x: 140, y: 75, type: 'gate', zoneName: 'Entry Gate A' },
      { id: 'EMERGENCY_EXIT_1', name: 'Emergency Exit 1 (North-West)', x: 85, y: 110, type: 'exit', zoneName: 'Exit NW' },
      { id: 'PARKING_A', name: 'Parking Zone A (West)', x: 85, y: 165, type: 'parking', zoneName: 'Parking Zone A' },
      { id: 'GATE_2', name: 'Gate 2 (North-East Gate)', x: 555, y: 75, type: 'gate', zoneName: 'Gate 2' },
      { id: 'EMERGENCY_EXIT_2', name: 'Emergency Exit 2 (North-East)', x: 615, y: 110, type: 'exit', zoneName: 'Exit NE' },
      { id: 'GATE_3', name: 'Gate 3 (South Concourse Gate)', x: 555, y: 625, type: 'gate', zoneName: 'Gate 3' },
      { id: 'EMERGENCY_EXIT_3', name: 'Emergency Exit 3 (South-East)', x: 615, y: 625, type: 'exit', zoneName: 'Exit SE' },
      { id: 'PARKING_B', name: 'Parking Zone B (East)', x: 615, y: 375, type: 'parking', zoneName: 'Parking Zone B' },

      // North Corridor (y = 142)
      { id: 'CONCOURSE_NW', name: 'North-West Concourse Junction', x: 202, y: 142, type: 'junction', zoneName: 'North Concourse' },
      { id: 'NORTH_STAND', name: 'North Stand (Club House)', x: 350, y: 70, type: 'stand', zoneName: 'North Stand' },
      { id: 'CONCOURSE_N_CROSS', name: 'North Concourse Walkway', x: 350, y: 142, type: 'junction', zoneName: 'North Concourse' },
      { id: 'CONCOURSE_NE', name: 'North-East Concourse Junction', x: 498, y: 142, type: 'junction', zoneName: 'North Concourse' },

      // West Corridor (x = 202)
      { id: 'CONCOURSE_A', name: 'Concourse A (West Walkway)', x: 202, y: 245, type: 'concourse', zoneName: 'West Concourse' },
      { id: 'WEST_STAND', name: 'West Stand (Sec 101-115)', x: 95, y: 350, type: 'stand', zoneName: 'West Stand' },
      { id: 'CONCOURSE_W_CROSS', name: 'West Stand Concourse Gate', x: 202, y: 350, type: 'junction', zoneName: 'West Concourse' },
      { id: 'RESTROOM_A', name: 'Restroom A (West Concourse)', x: 202, y: 460, type: 'amenity', zoneName: 'Restroom A' },
      { id: 'CONCOURSE_SW', name: 'South-West Concourse Junction', x: 202, y: 558, type: 'junction', zoneName: 'South Concourse' },

      // Center Crossroads (x = 350, y = 350)
      { id: 'CENTER_CROSS', name: 'Concourse C (Center Crossroads)', x: 350, y: 350, type: 'concourse', zoneName: 'Center Concourse' },

      // East Corridor (x = 498)
      { id: 'CONCOURSE_B', name: 'Concourse B (East Walkway)', x: 498, y: 245, type: 'concourse', zoneName: 'East Concourse' },
      { id: 'FOOD_COURT', name: 'Food & Beverage Court', x: 498, y: 300, type: 'amenity', zoneName: 'Food Court' },
      { id: 'CONCOURSE_E_CROSS', name: 'East Stand Concourse Gate', x: 498, y: 350, type: 'junction', zoneName: 'East Concourse' },
      { id: 'EAST_STAND', name: 'East Stand (Sec 201-215)', x: 605, y: 350, type: 'stand', zoneName: 'East Stand' },
      { id: 'RESTROOM_B', name: 'Restroom B (East Concourse)', x: 498, y: 460, type: 'amenity', zoneName: 'Restroom B' },
      { id: 'PARKING_C', name: 'Parking Zone C (South-East)', x: 498, y: 515, type: 'parking', zoneName: 'Parking Zone C' },
      { id: 'CONCOURSE_SE', name: 'South-East Concourse Junction', x: 498, y: 558, type: 'junction', zoneName: 'South Concourse' },

      // South Corridor (y = 558)
      { id: 'CONCOURSE_S_CROSS', name: 'South Concourse Walkway', x: 350, y: 558, type: 'junction', zoneName: 'South Concourse' },
      { id: 'SOUTH_STAND', name: 'South Stand (Pavilion)', x: 350, y: 630, type: 'stand', zoneName: 'South Stand' }
    ],

    // Pure Walkway Concourse Edges (Distances in meters, completely rectilinear along corridors)
    edges: [
      // Gate 1 Entrance & Exit 1
      { from: 'GATE_1', to: 'CONCOURSE_NW', distance: 18 },
      { from: 'GATE_1', to: 'EMERGENCY_EXIT_1', distance: 15 },
      { from: 'EMERGENCY_EXIT_1', to: 'PARKING_A', distance: 15 },
      { from: 'PARKING_A', to: 'CONCOURSE_NW', distance: 20 },

      // North Corridor Walkway (y = 142)
      { from: 'CONCOURSE_NW', to: 'CONCOURSE_N_CROSS', distance: 35 },
      { from: 'CONCOURSE_N_CROSS', to: 'NORTH_STAND', distance: 20 },
      { from: 'CONCOURSE_N_CROSS', to: 'CONCOURSE_NE', distance: 35 },
      { from: 'CONCOURSE_NE', to: 'GATE_2', distance: 18 },
      { from: 'GATE_2', to: 'EMERGENCY_EXIT_2', distance: 15 },

      // West Corridor Walkway (x = 202)
      { from: 'CONCOURSE_NW', to: 'CONCOURSE_A', distance: 25 },
      { from: 'CONCOURSE_A', to: 'CONCOURSE_W_CROSS', distance: 25 },
      { from: 'WEST_STAND', to: 'CONCOURSE_W_CROSS', distance: 25 },
      { from: 'CONCOURSE_W_CROSS', to: 'RESTROOM_A', distance: 25 },
      { from: 'RESTROOM_A', to: 'CONCOURSE_SW', distance: 25 },

      // Horizontal Corridor Crossing (y = 350)
      { from: 'CONCOURSE_W_CROSS', to: 'CENTER_CROSS', distance: 35 },
      { from: 'CENTER_CROSS', to: 'CONCOURSE_E_CROSS', distance: 35 },
      { from: 'CONCOURSE_E_CROSS', to: 'EAST_STAND', distance: 25 },
      { from: 'EAST_STAND', to: 'PARKING_B', distance: 15 },

      // Vertical Corridor Crossing (x = 350)
      { from: 'CONCOURSE_N_CROSS', to: 'CENTER_CROSS', distance: 45 },
      { from: 'CENTER_CROSS', to: 'CONCOURSE_S_CROSS', distance: 45 },
      { from: 'CONCOURSE_S_CROSS', to: 'SOUTH_STAND', distance: 20 },

      // East Corridor Walkway (x = 498)
      { from: 'CONCOURSE_NE', to: 'CONCOURSE_B', distance: 25 },
      { from: 'CONCOURSE_B', to: 'FOOD_COURT', distance: 15 },
      { from: 'FOOD_COURT', to: 'CONCOURSE_E_CROSS', distance: 15 },
      { from: 'CONCOURSE_E_CROSS', to: 'RESTROOM_B', distance: 25 },
      { from: 'RESTROOM_B', to: 'PARKING_C', distance: 15 },
      { from: 'PARKING_C', to: 'CONCOURSE_SE', distance: 15 },
      { from: 'CONCOURSE_SE', to: 'GATE_3', distance: 18 },
      { from: 'GATE_3', to: 'EMERGENCY_EXIT_3', distance: 15 },

      // South Corridor Walkway (y = 558)
      { from: 'CONCOURSE_SW', to: 'CONCOURSE_S_CROSS', distance: 35 },
      { from: 'CONCOURSE_S_CROSS', to: 'CONCOURSE_SE', distance: 35 }
    ],

    // Check if node is hazardous (Flame OR MQ-135 >= 3000 OR Crowd < 25)
    isNodeHazardous(nodeId) {
      const state = window.StadiumState;
      if (!state || !state.sensorData) return false;

      // Gate 1 / Entry Gate A is physically monitored by ESP32 sensors
      if (nodeId === 'GATE_1' || nodeId === 'CONCOURSE_NW') {
        const isFlame = Boolean(state.sensorData.flame);
        const isGasHazard = Boolean(state.sensorData.mq135_raw && state.sensorData.mq135_raw >= 3000);
        const isCrowdSurge = Boolean(state.sensorData.distance_cm && state.sensorData.distance_cm > 0 && state.sensorData.distance_cm < 25);
        return (isFlame || isGasHazard || isCrowdSurge);
      }
      return false;
    },

    // Dijkstra Shortest Path Engine with Dynamic Hazard Rerouting
    findPath(startId, endId) {
      if (!startId || !endId) return null;
      if (startId === endId) {
        const node = this.nodes.find(n => n.id === startId);
        return {
          path: [startId],
          points: [node ? { x: node.x, y: node.y } : { x: 350, y: 350 }],
          distance: 0,
          walkTimeSec: 0,
          steps: [`You are already at ${node ? node.name : startId}.`],
          rerouted: false
        };
      }

      const blockedNodes = new Set();
      this.nodes.forEach(n => {
        if (this.isNodeHazardous(n.id)) {
          blockedNodes.add(n.id);
        }
      });

      let rerouted = false;
      let targetDestination = endId;

      // If destination itself is blocked, route to nearest safe emergency exit
      if (blockedNodes.has(endId)) {
        targetDestination = 'EMERGENCY_EXIT_1';
        rerouted = true;
      }

      // Build Graph
      const adj = {};
      this.nodes.forEach(n => { adj[n.id] = []; });
      this.edges.forEach(e => {
        let weight = e.distance;
        if (blockedNodes.has(e.from) || blockedNodes.has(e.to)) {
          weight = 999999; // Extreme penalty forcing Dijkstra to take alternate safe corridors
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
        if (current === targetDestination) break;

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
      let curr = targetDestination;
      while (curr !== null) {
        path.unshift(curr);
        curr = previous[curr];
      }

      if (path.length === 0 || path[0] !== startId) {
        return {
          path: [],
          points: [],
          distance: 0,
          walkTimeSec: 0,
          steps: ['⚠️ No safe walkway available due to active hazard! Follow illuminated floor arrows.'],
          rerouted: true
        };
      }

      // Compute physical distance and orthogonal pathway points
      let actualDistance = 0;
      const points = [];
      for (let i = 0; i < path.length; i++) {
        const node = this.nodes.find(n => n.id === path[i]);
        if (node) points.push({ x: node.x, y: node.y });
        if (i < path.length - 1) {
          const edge = this.edges.find(e =>
            (e.from === path[i] && e.to === path[i + 1]) ||
            (e.from === path[i + 1] && e.to === path[i])
          );
          if (edge) actualDistance += edge.distance;
        }
      }

      const walkTimeSec = Math.round(actualDistance / 1.15); // ~1.15 m/s indoor walking pace

      // Generate step-by-step guidance
      const steps = [];
      for (let i = 0; i < path.length; i++) {
        const nodeObj = this.nodes.find(n => n.id === path[i]);
        if (i === 0) {
          steps.push(`Start at <strong>${nodeObj.name}</strong>`);
        } else if (i === path.length - 1) {
          steps.push(`Arrive safely at <strong>${nodeObj.name}</strong>`);
        } else {
          steps.push(`Walk along concourse via <strong>${nodeObj.name}</strong>`);
        }
      }

      if (blockedNodes.size > 0 && (path.includes('GATE_1') || path.includes('CONCOURSE_NW'))) {
        rerouted = true;
      }

      return {
        path,
        points,
        distance: actualDistance,
        walkTimeSec,
        steps,
        rerouted
      };
    },

    // DIRECT EVACUATION: Automatically finds the NEAREST SAFE EMERGENCY EXIT from person's location
    findNearestSafeExit(startNodeId) {
      const exits = ['EMERGENCY_EXIT_1', 'EMERGENCY_EXIT_2', 'EMERGENCY_EXIT_3'];
      let bestResult = null;
      let minDistance = Infinity;

      for (const exitId of exits) {
        const res = this.findPath(startNodeId, exitId);
        if (res && res.path && res.path.length > 0 && res.distance > 0) {
          if (res.distance < minDistance) {
            minDistance = res.distance;
            bestResult = { exitId, result: res };
          }
        }
      }
      return bestResult;
    }
  };

  window.NavigationService = NavigationService;
})();
