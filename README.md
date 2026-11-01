# STADIUMSAFE AI — SMART CROWD, PARKING & EMERGENCY NAVIGATION SYSTEM
### ESP32 Physical Multi-Sensor Integration Prototype

> **College Engineering Capstone / Mini-Project**  
> *Real Hardware Microcontroller Telemetry ➔ Web Serial API & Local Wi-Fi ➔ Automated Facility Ingress, Fire Safety & Dynamic Rerouting Engine*

---

## 1. Project Overview

**StadiumSafe AI** connects physical IoT sensors to an interactive stadium command and visitor safety dashboard. The system collects telemetry from an **ESP32 microcontroller** reading real-world hardware sensors and feeds it directly into a browser application without requiring paid cloud infrastructure or complex setups.

### Key Capabilities
- **Mode 1 — USB / COM Port Link:** Uses the W3C **Web Serial API** for direct zero-latency browser-to-ESP32 communication via USB cable.
- **Mode 2 — Local Wi-Fi Link:** Connects to the ESP32’s onboard HTTP REST API (`/api/sensors`, `/api/status`) and optional WebSocket over your local Wi-Fi router or phone hotspot.
- **Sensor Fusion:**
  - **Ultrasonic Distance (HC-SR04):** Measures crowd ingress bottleneck distance at Entry Gate A.
  - **Flame Sensor (Optical IR):** Detects open fire; automatically triggers a Level 5 emergency evacuation protocol.
  - **MQ135 Gas Sensor:** Reads relative ambient air quality & smoke concentration.
  - **IR Obstacle Sensor:** Confirms physical human presence and tracks smart parking stall occupancy.
- **Dynamic Indoor Pathfinding:** Dijkstra-based shortest-path indoor wayfinding dynamically blocks hazardous sectors (such as Entry Gate A during fire) and detours spectators toward safe emergency exits.
- **Simulation Fallback (Demo Mode):** Allows full presentation demonstrations even if physical hardware is momentarily disconnected.

---

## 2. Exact Folder Structure

```text
stadium-safe-ai/
│
├── package.json               # Node.js project manifest & dependencies (Express, CORS)
├── server.js                 # Express server for static hosting & local REST APIs
├── README.md                 # Master project documentation & presentation guide
│
├── esp32/
│   ├── stadiumsafe_esp32.ino # Complete Arduino C++ firmware for ESP32
│   └── README.md             # Hardware wiring, voltage divider & flashing guide
│
├── data/
│   └── stadiumData.json      # Stadium stadium sectors, parking stalls, waypoints
│
├── public/
│   ├── index.html            # Venue overview, architecture & launcher
│   ├── dashboard.html        # High-level stadium overview & metrics
│   ├── sensors.html          # Live 4-card sensor dashboard, history & canvas chart
│   ├── crowd.html            # Sector density heatmap & queue throughput
│   ├── emergency.html        # 5-stage automated escalation & dispatch console
│   ├── navigation.html       # Interactive graph map with Dijkstra dynamic rerouting
│   ├── parking.html          # Real-time stall grid linked to physical IR sensor
│   ├── qr-seat.html          # Spectator ticket view, waypoint navigation & SOS
│   ├── public-alert.html     # High-visibility stadium jumbotron broadcast display
│   └── control-room.html     # Security command center with multi-cam surveillance
│
├── public/css/
│   └── style.css             # High-tech dark command room UI & glassmorphic styling
│
└── public/js/
    ├── app.js                # Global state management, status bar, and audio synthesis
    ├── esp32Serial.js        # Web Serial API driver (port open, buffering, JSON parse)
    ├── esp32Wifi.js          # Wi-Fi HTTP client & polling driver
    ├── sensorService.js      # Sensor fusion, threshold scoring & emergency triggers
    ├── simulationService.js  # Virtual demonstration engine (preserves real hardware priority)
    ├── navigationService.js  # Dijkstra pathfinding & dynamic hazard avoidance engine
    ├── alertService.js       # Alert lifecycle, spectator SOS & alarm dispatch
    └── parkingService.js     # Parking stall state management & IR hardware sync
```

---

## 3. Hardware Wiring Table & Pinout (ZERO RESISTORS NEEDED)

> [!TIP]
> **DIRECT WIRE CONNECTION (NO RESISTORS / NO VOLTAGE DIVIDER):**  
> Connect the HC-SR04 `VCC` pin directly to the ESP32 **3.3V pin**. When powered from 3.3V, the HC-SR04's `ECHO` pulse natively matches the ESP32's 3.3V logic level.  
> You can wire all 4 sensors directly using standard jumper wires without any resistors or breadboard voltage dividers!

| Sensor | Sensor Pin | ESP32 GPIO | Operating Voltage | Connection Type |
| :--- | :--- | :--- | :--- | :--- |
| **HC-SR04 Ultrasonic** | VCC | **3.3V** | 3.3V DC | Direct jumper wire (Powers at 3.3V for safe Echo) |
| | GND | **GND** | 0V | Direct jumper wire (Common Ground) |
| | TRIG | **GPIO 5** | 3.3V Output | Direct jumper wire (10μs trigger pulse) |
| | ECHO | **GPIO 18** | **3.3V Input** | **Direct jumper wire — NO RESISTOR NEEDED!** |
| **Flame Sensor** | VCC | **3.3V** | 3.3V DC | Direct jumper wire |
| | GND | **GND** | 0V | Direct jumper wire |
| | D0 | **GPIO 19** | 3.3V Input | Direct jumper wire (`FLAME_ACTIVE_LEVEL LOW`) |
| **MQ-135 Gas Sensor** | VCC | **VIN (5V) or 3.3V** | 5V / 3.3V DC | Direct jumper wire (VIN from USB powers heater) |
| | GND | **GND** | 0V | Direct jumper wire |
| | A0 | **GPIO 34** | 0–3.3V Analog | Direct jumper wire (ADC1 channel, safe with Wi-Fi) |
| **IR Obstacle Sensor** | VCC | **3.3V** | 3.3V DC | Direct jumper wire |
| | GND | **GND** | 0V | Direct jumper wire |
| | OUT | **GPIO 23** | 3.3V Input | Direct jumper wire (`IR_ACTIVE_LEVEL LOW`) |

---

## 4. Software Setup & Running the Website

### Step 1: Install Dependencies
Open your command terminal (PowerShell, Command Prompt, or bash) in the project directory:
```bash
npm install
```

### Step 2: Start the Local Node.js Server
```bash
npm start
```
The server will output:
```text
====================================================
   STADIUMSAFE AI - SMART CROWD & SENSOR SYSTEM    
====================================================
[SERVER] Running at: http://localhost:3000
[SERVER] Dashboard:  http://localhost:3000/dashboard.html
[SERVER] Sensors UI: http://localhost:3000/sensors.html
[SERVER] Ready for Web Serial USB & WiFi Connections
====================================================
```

### Step 3: Open in Browser
Open Google Chrome or Microsoft Edge and navigate to:
```text
http://localhost:3000
```

---

## 5. Arduino IDE & Firmware Flashing

1. **Install Arduino IDE** (v2.x or latest from [arduino.cc](https://www.arduino.cc/en/software)).
2. **Add ESP32 Board Support:**
   - Go to `File` ➔ `Preferences`.
   - In "Additional Boards Manager URLs", add:
     ```text
     https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
     ```
   - Go to `Tools` ➔ `Board` ➔ `Boards Manager...`, search for `esp32` by *Espressif Systems* and click **Install**.
3. **Install Required Libraries:**
   - In Arduino IDE, open `Sketch` ➔ `Include Library` ➔ `Manage Libraries...`.
   - Search for and install:
     - **ArduinoJson** by *Benoît Blanchon* (Version 6.x or 7.x).
     - Standard ESP32 libraries (`WiFi.h`, `WebServer.h`) are included out of the box with the board package.
4. **Configure Wi-Fi Credentials (for Mode 2):**
   - Open `esp32/stadiumsafe_esp32.ino`.
   - Change lines 25–26 to your Wi-Fi name and password:
     ```cpp
     const char* WIFI_SSID     = "YOUR_WIFI_NAME";
     const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
     ```
5. **Flash Firmware:**
   - Connect the ESP32 to your PC with a micro-USB data cable.
   - Select your board: `Tools` ➔ `Board` ➔ `DOIT ESP32 DEVKIT V1`.
   - Select your COM Port: `Tools` ➔ `Port` ➔ `COMx`.
   - Click the **Upload** button. *(If stuck on `Connecting......._____`, press and hold the physical **BOOT** button on the ESP32 until flashing starts).*
6. **Find ESP32 IP Address:**
   - Open the Arduino **Serial Monitor** at **115200 baud**.
   - Note down the IP address printed on boot (e.g. `192.168.1.100`).
   - **CRITICAL:** **CLOSE the Serial Monitor** before attempting to connect on the website, or Windows will block browser COM port access!

---

## 6. How to Connect & Test

### Connecting Mode 1: USB / COM (Web Serial)
1. Open `http://localhost:3000/sensors.html`.
2. Ensure the connection mode is set to **USB / COM**.
3. Confirm baud rate is set to **115200**.
4. Click **CONNECT ESP32**.
5. In the browser popup window, choose your ESP32's COM port (e.g., `CP2102 USB to UART Bridge` or `CH340`) and click **Connect**.
6. The status indicator immediately turns **🟢 CONNECTED**, and live distance, flame, MQ135, and IR values start streaming!

### Connecting Mode 2: Wi-Fi HTTP Mode
1. Ensure both your computer and the ESP32 are connected to the same Wi-Fi router or phone mobile hotspot.
2. In `http://localhost:3000/sensors.html`, switch to the **Wi-Fi** tab.
3. Enter your ESP32 IP address: `192.168.1.100`.
4. Click **CONNECT ESP32 WI-FI**.
5. The website performs an HTTP handshake with `http://192.168.1.100/api/status` and begins continuous telemetry polling!

---

## 7. How to Test Each Sensor

| Sensor | Action | Expected Result |
| :--- | :--- | :--- |
| **HC-SR04 Ultrasonic** | Wave your hand 20–30 cm in front of the sensor. | `distance_cm` drops from ~120cm to ~25cm; density score climbs from LOW to HIGH/CRITICAL; Gate A crowd turns orange/red. |
| **Flame Sensor** | Safely hold an infrared flame (lighter, match, or phone flashlight) 20 cm away. | Flame card pulses **🔥 FIRE DETECTED**; simulated audio alarm sounds; Level 5 emergency engaged; Entry Gate A is marked **❌ BLOCKED**; Navigation recalculates alternate route. |
| **MQ-135 Gas Sensor** | Gently breathe on sensor or hold an unlit lighter/alcohol wipe near sensor grid. | `mq135_raw` climbs from ~800 to >2000; status changes from **GOOD** to **POOR AIR QUALITY**. |
| **IR Obstacle Sensor** | Place a finger or small object 2–4 cm in front of the IR diodes. | IR status switches to **OBJECT DETECTED**; Parking Lot A **Slot A-01** immediately switches from VACANT (green) to OCCUPIED (red). |

---

## 8. College Project Demo Script (5-Minute Presentation)

1. **Introduction:** Open `index.html`. Explain the challenge of modern stadium crowd safety and how IoT microcontrollers can prevent stampedes and detect fire early.
2. **Hardware Demonstration:** Open `sensors.html`. Click **CONNECT ESP32** via USB Web Serial. Show the 4 live sensor telemetry cards updating in real time.
3. **Crowd Test:** Move your palm close to the ultrasonic sensor. Show the distance dropping and the queue density score spiking on `crowd.html`.
4. **Fire Emergency & Dynamic Detour:**
   - Safely expose the flame sensor.
   - Observe how the entire system triggers:
     - Top banner flashes **🔥 FIRE EMERGENCY**.
     - Public alert display (`public-alert.html`) turns full-screen red with evacuation instructions.
     - Open `navigation.html`: Show that **Entry Gate A** has been flagged **❌ BLOCKED**, and the Dijkstra algorithm has detoured visitors to **Emergency Exit NW**.
5. **Smart Parking Integration:** Put an object in front of the IR sensor. Open `parking.html` and point out **Slot A-01** updating to **OCCUPIED**.
6. **Control Room Overview:** Open `control-room.html` to show the comprehensive command center console.

#   S T A D I U M - S A F E  
 