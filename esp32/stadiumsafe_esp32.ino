/**
 * ==============================================================================
 * STADIUMSAFE AI — ESP32 HARDWARE SENSOR HUB FIRMWARE (ULTRA-RESILIENT)
 * Smart Crowd, Parking & Emergency Navigation System
 * ==============================================================================
 * College Engineering Project Prototype
 * 
 * SENSORS CONNECTED:
 *  1. Ultrasonic Distance Sensor (HC-SR04) -> Real Crowd Density estimation
 *  2. Flame Sensor (Optical IR / LM393)    -> Real Fire Emergency Trigger
 *  3. MQ-135 Gas Sensor (A0)               -> Real Air Quality (>3000 Alarm Trigger)
 *  4. IR Obstacle Sensor (TCRT5000 / LM393)-> Real Smart Parking Space / Occupancy
 *  5. Optional Physical Buzzer (GPIO 13)   -> Audible Emergency Alarm
 * 
 * ==============================================================================
 * HARDWARE CONNECTIONS (ZERO RESISTORS — DIRECT JUMPER WIRES ONLY!)
 * ==============================================================================
 * 
 * 1. HC-SR04 ULTRASONIC SENSOR:
 *    - VCC  -> ESP32 VIN (5V from USB)  *** IMPORTANT: MUST BE 5V/VIN! ***
 *    - GND  -> ESP32 GND
 *    - TRIG -> ESP32 GPIO 5 (or GPIO 4 - code pulses BOTH simultaneously!)
 *    - ECHO -> ESP32 GPIO 18 (Direct wire — NO RESISTOR NEEDED!)
 * 
 * 2. OPTICAL FLAME SENSOR (LM393):
 *    - VCC  -> ESP32 3.3V (3V3)
 *    - GND  -> ESP32 GND
 *    - D0   -> ESP32 GPIO 19 (Direct wire)
 * 
 * 3. MQ-135 GAS / AIR QUALITY SENSOR:
 *    - VCC  -> ESP32 VIN (5V) or 3.3V
 *    - GND  -> ESP32 GND
 *    - A0   -> ESP32 GPIO 34 (Direct wire — ADC1 input)
 * 
 * 4. IR OBSTACLE / PROXIMITY SENSOR (LM393):
 *    - VCC  -> ESP32 3.3V (3V3)
 *    - GND  -> ESP32 GND
 *    - OUT  -> ESP32 GPIO 23 (Direct wire — with INPUT_PULLUP)
 *    * NOTE: If the module's on-board LED is always ON, turn its blue
 *      potentiometer screw counter-clockwise until the LED turns OFF when clear.
 * 
 * 5. OPTIONAL BUZZER:
 *    - POSITIVE (+) -> ESP32 GPIO 13
 *    - NEGATIVE (-) -> ESP32 GND
 * 
 * ==============================================================================
 * ARDUINO IDE COMPILATION INSTRUCTIONS:
 *  - Board: Tools -> Board -> esp32 -> "ESP32 Dev Module"
 *  - Port: Select your ESP32 COM port
 *  - Upload Speed: 115200
 * ==============================================================================
 */

#include <WiFi.h>
#include <WebServer.h>

// ==============================================================================
// 1. OPERATION MODE CONFIGURATION
// ==============================================================================
// Set to 'false' for pure USB/COM mode (Recommended: Instant boot, zero brownouts, rock-solid!)
// Set to 'true' if you want the ESP32 to also connect to Wi-Fi and host HTTP endpoints
#define ENABLE_WIFI   false

const char* WIFI_SSID     = "Your_WiFI";
const char* WIFI_PASSWORD = "Your_WiFi_Password";

#if ENABLE_WIFI
WebServer server(80);
#endif

// ==============================================================================
// 2. HARDWARE GPIO PIN DEFINITIONS (ZERO RESISTORS)
// ==============================================================================
#define TRIG_PIN_A   5    // Ultrasonic Trigger Pin Option A (GPIO 5)
#define TRIG_PIN_B   4    // Ultrasonic Trigger Pin Option B (GPIO 4)
#define ECHO_PIN    18    // Ultrasonic Echo Pin (GPIO 18 - Direct wire, NO RESISTOR)

#define FLAME_PIN   19    // Flame Sensor Digital Output D0 (GPIO 19)
#define MQ135_PIN   34    // MQ-135 Analog Output A0 (GPIO 34 - ADC1)
#define IR_PIN      23    // IR Obstacle Sensor Output OUT (GPIO 23)
#define BUZZER_PIN  13    // Physical Buzzer Alarm Pin (GPIO 13)

// ==============================================================================
// 3. SENSOR LOGIC LEVELS & ALARM THRESHOLDS
// ==============================================================================
#define FLAME_ACTIVE_LEVEL   LOW    // LOW = Flame detected (LED on module lights up)

// IR SENSOR ACTIVE LEVEL:
// Standard LM393 modules output LOW when object is detected, HIGH when clear.
// If your IR sensor is ALWAYS ON when no object is there, change this to HIGH:
#define IR_ACTIVE_LEVEL      LOW   // Set to HIGH if your sensor outputs HIGH on object

// Air Quality Alarm Threshold
#define MQ135_ALARM_THRESHOLD 3000  // Alarm sounds if MQ135 exceeds 3000

// Telemetry streaming interval (400ms = 2.5 updates per second)
const unsigned long SENSOR_INTERVAL_MS = 400;

// Device Metadata
const char* DEVICE_NAME = "ESP32";
const char* DEVICE_ID   = "STADIUMSAFE-ESP32-01";
const char* DEVICE_ZONE = "Entry Gate A";

// Runtime Variables
unsigned long lastSampleTime = 0;
unsigned long packetCount    = 0;

float currentDistanceCm = 0.0;
bool  currentFlame      = false;
int   currentMq135Raw   = 800;
bool  currentIrDetected = false;
bool  wifiActive        = false;
bool  currentAlarm      = false;

// ==============================================================================
// SENSOR READING FUNCTIONS
// ==============================================================================

/**
 * Read Ultrasonic distance in cm using HC-SR04
 * Pulses BOTH GPIO 5 and GPIO 4 so whichever pin you plugged into, it triggers!
 */
float readUltrasonic() {
  digitalWrite(TRIG_PIN_A, LOW);
  digitalWrite(TRIG_PIN_B, LOW);
  delayMicroseconds(4);

  digitalWrite(TRIG_PIN_A, HIGH);
  digitalWrite(TRIG_PIN_B, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN_A, LOW);
  digitalWrite(TRIG_PIN_B, LOW);

  if (digitalRead(ECHO_PIN) == HIGH) {
    delayMicroseconds(50);
  }

  long duration = pulseIn(ECHO_PIN, HIGH, 30000);

  if (duration <= 0) {
    return 0.0;
  }

  float dist = (duration * 0.0343) / 2.0;
  if (dist < 2.0)   dist = 2.0;
  if (dist > 400.0) dist = 400.0;

  return dist;
}

/**
 * Read Optical Flame Sensor (digital D0)
 */
bool readFlame() {
  int val = digitalRead(FLAME_PIN);
  return (val == FLAME_ACTIVE_LEVEL);
}

/**
 * Read MQ-135 Gas / Air Quality sensor (analog A0)
 */
int readMq135() {
  return analogRead(MQ135_PIN);
}

/**
 * Read IR Obstacle Sensor (digital OUT)
 */
bool readIr() {
  int val = digitalRead(IR_PIN);
  return (val == IR_ACTIVE_LEVEL);
}

/**
 * Build valid JSON telemetry string natively (No external ArduinoJson library needed)
 */
String buildJsonString() {
  String json = "{";
  json += "\"device\":\"" + String(DEVICE_NAME) + "\",";
  json += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
  json += "\"zone\":\"" + String(DEVICE_ZONE) + "\",";
  json += "\"timestamp\":" + String(millis()) + ",";
  json += "\"sequence\":" + String(packetCount) + ",";
  json += "\"distance_cm\":" + String(currentDistanceCm, 1) + ",";
  json += "\"flame\":" + String(currentFlame ? "true" : "false") + ",";
  json += "\"mq135_raw\":" + String(currentMq135Raw) + ",";
  json += "\"ir_detected\":" + String(currentIrDetected ? "true" : "false") + ",";
  json += "\"alarm_active\":" + String(currentAlarm ? "true" : "false");
  json += "}";
  return json;
}

#if ENABLE_WIFI
// ==============================================================================
// HTTP REST API HANDLERS WITH CORS (FOR WI-FI MODE)
// ==============================================================================
void sendCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
}

void handleCorsPreflight() {
  sendCorsHeaders();
  server.send(204);
}

void handleSensorsApi() {
  sendCorsHeaders();
  String payload = buildJsonString();
  server.send(200, "application/json", payload);
}

void handleStatusApi() {
  sendCorsHeaders();
  String statusJson = "{";
  statusJson += "\"connected\":true,";
  statusJson += "\"wifi\":true,";
  statusJson += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
  statusJson += "\"uptime\":" + String(millis()) + ",";
  statusJson += "\"device_id\":\"" + String(DEVICE_ID) + "\"";
  statusJson += "}";
  server.send(200, "application/json", statusJson);
}

void handleNotFound() {
  sendCorsHeaders();
  server.send(404, "application/json", "{\"error\":\"Endpoint not found\"}");
}
#endif

// ==============================================================================
// SETUP FUNCTION
// ==============================================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  // Configure Pin Modes
  pinMode(TRIG_PIN_A, OUTPUT);
  pinMode(TRIG_PIN_B, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(FLAME_PIN, INPUT);
  pinMode(IR_PIN, INPUT_PULLUP); // Enable pullup to prevent floating pin!
  pinMode(BUZZER_PIN, OUTPUT);

  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(TRIG_PIN_A, LOW);
  digitalWrite(TRIG_PIN_B, LOW);

  // Set 12-bit ADC resolution for MQ135 (0 - 4095)
  analogReadResolution(12);

#if ENABLE_WIFI
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - wifiStart < 5000)) {
    delay(200);
  }
  if (WiFi.status() == WL_CONNECTED) {
    wifiActive = true;
    server.on("/api/sensors", HTTP_OPTIONS, handleCorsPreflight);
    server.on("/api/sensors", HTTP_GET,     handleSensorsApi);
    server.on("/api/status",  HTTP_OPTIONS, handleCorsPreflight);
    server.on("/api/status",  HTTP_GET,     handleStatusApi);
    server.onNotFound(handleNotFound);
    server.begin();
  }
#else
  WiFi.mode(WIFI_OFF);
#endif

  currentDistanceCm = readUltrasonic();
  currentFlame      = readFlame();
  currentMq135Raw   = readMq135();
  currentIrDetected = readIr();
  currentAlarm      = (currentFlame || currentMq135Raw >= MQ135_ALARM_THRESHOLD);

  Serial.println(buildJsonString());
}

// ==============================================================================
// MAIN LOOP
// ==============================================================================
void loop() {
#if ENABLE_WIFI
  if (wifiActive) {
    server.handleClient();
  }
#endif

  unsigned long now = millis();
  if (now - lastSampleTime >= SENSOR_INTERVAL_MS) {
    lastSampleTime = now;
    packetCount++;

    // 1. Read real physical hardware pins
    currentDistanceCm = readUltrasonic();
    currentFlame      = readFlame();
    currentMq135Raw   = readMq135();
    currentIrDetected = readIr();

    // 2. Alarm Trigger: Flame OR MQ135 >= 3000
    if (currentFlame || currentMq135Raw >= MQ135_ALARM_THRESHOLD) {
      currentAlarm = true;
      digitalWrite(BUZZER_PIN, HIGH); // Sound buzzer
    } else {
      currentAlarm = false;
      digitalWrite(BUZZER_PIN, LOW);  // Silence buzzer
    }

    // 3. Transmit clean JSON packet over USB Serial
    String jsonPacket = buildJsonString();
    Serial.println(jsonPacket);
  }
}
