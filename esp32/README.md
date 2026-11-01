# STADIUMSAFE AI — ESP32 HARDWARE & ARDUINO IDE GUIDE

This guide explains how to wire and compile the firmware in Arduino IDE with **zero external libraries** and **zero resistors**.

---

## 1. Hardware Connections (Direct Wires — ZERO Resistors)

Connect all 4 physical sensors directly to the ESP32 pins using jumper wires. You **do not** need any resistors or breadboard voltage divider:

```text
       ESP32 BOARD                     SENSORS (DIRECT WIRES)
 ┌─────────────────────┐             ┌─────────────────────────┐
 │     VIN (5V) from USB─────────────┤ VCC (HC-SR04 Ultrasonic)│ *** MUST BE VIN 5V! ***
 │         GND ────────┼─────────────┤ GND                     │
 │  GPIO 5 (or GPIO 4) ┼─────────────┤ TRIG (Direct wire)      │
 │     GPIO 18 ────────┼─────────────┤ ECHO (Direct, NO R!)    │
 │                     │             └─────────────────────────┘
 │        3.3V ────────┼─────────────┬─ VCC (Flame Sensor)
 │         GND ────────┼─────────────┼─ GND
 │     GPIO 19 ────────┼─────────────┴─ D0 (Digital Output)
 │                     │
 │     VIN (5V) or 3.3V┼─────────────┬─ VCC (MQ-135 Gas Sensor)
 │         GND ────────┼─────────────┼─ GND
 │     GPIO 34 ────────┼─────────────┴─ A0 (Analog ADC1)
 │                     │
 │        3.3V ────────┼─────────────┬─ VCC (IR Obstacle Sensor)
 │         GND ────────┼─────────────┼─ GND
 │     GPIO 23 ────────┼─────────────┴─ OUT (Direct with INPUT_PULLUP)
 │                     │
 │     GPIO 13 ────────┼─────────────┬─ Positive (+) (Optional Buzzer)
 │         GND ────────┼─────────────┴─ Negative (-)
 └─────────────────────┘
```

### Complete Pinout Table:

| Sensor | Sensor Pin | ESP32 Pin | Notes |
| :--- | :--- | :--- | :--- |
| **HC-SR04 Ultrasonic** | **VCC** | **VIN (5V)** | **MUST BE 5V/VIN! (HC-SR04 cannot transmit on 3.3V)** |
| | **GND** | **GND** | Common ground |
| | **TRIG** | **GPIO 5** (or **GPIO 4**) | Code triggers BOTH GPIO 5 and GPIO 4 automatically! |
| | **ECHO** | **GPIO 18** | **Direct wire — NO RESISTOR NEEDED** |
| **Flame Sensor** | **VCC** | **3.3V** | Direct connection |
| | **GND** | **GND** | Common ground |
| | **D0** | **GPIO 19** | Active LOW on flame detection |
| **MQ-135 Gas Sensor** | **VCC** | **VIN (5V)** or **3.3V** | VIN provides full heater power |
| | **GND** | **GND** | Common ground |
| | **A0** | **GPIO 34** | Analog ADC1 channel (Safe with Wi-Fi) |
| **IR Obstacle Sensor** | **VCC** | **3.3V** | Direct connection |
| | **GND** | **GND** | Common ground |
| | **OUT** | **GPIO 23** | Configured with `INPUT_PULLUP` to avoid floating |
| **Optional Buzzer** | **(+)** | **GPIO 13** | Sounds on Fire OR MQ135 > 3000 |
| | **(-)** | **GND** | Common ground |

---

## 2. Fixing the IR Sensor ("Always ON" when no object is there)

If your IR Obstacle sensor is constantly reporting `OBJECT DETECTED` / `OCCUPIED`:

### Option A — 1-Click Fix on the Website (No Re-upload needed!):
- Look at the sensor strip at the top of the website.
- Next to `👤 IR Obstacle:`, you will see a button labeled **`🔄 Invert IR`**.
- Click **`🔄 Invert IR`** once! It immediately flips the polarity in the browser, turning the reading from `OBJECT DETECTED` to `CLEAR`!

### Option B — Adjust the Blue Potentiometer on the IR Module:
- Look at the small physical IR module board. You will see a small **blue square with a brass screw** (trimmer potentiometer) and two LEDs.
- If the green/red indicator LED on the board is permanently turned ON, the sensor is calibrated too sensitive.
- Use a small screwdriver to turn the potentiometer screw **counter-clockwise** until the LED turns **OFF** when there is nothing in front of it.
- Wave your hand in front of the two sensor bulbs (2 to 5 cm away): the LED should light up when your hand is there and turn OFF when you remove your hand.

### Option C — In Firmware:
- In `esp32/stadiumsafe_esp32.ino`, you can toggle:
  ```cpp
  #define IR_ACTIVE_LEVEL HIGH // Change between LOW and HIGH
  ```

---

## 3. MQ-135 Air Quality Sensor & Alarm Threshold (> 3000)

- The firmware and website are now configured with a **safety threshold of 3000 ADC**.
- **When raw MQ-135 value passes 3000:**
  1. **Audible Siren/Buzzer:** The website immediately plays the continuous dual-tone emergency siren.
  2. **Physical Buzzer Pin (GPIO 13):** If you plug a buzzer into GPIO 13, it will sound automatically.
  3. **Safety Status Card:** Shifts to a flashing red emergency alert: `TOXIC GAS / SMOKE HAZARD (> 3000)!`.
  4. **Emergency Screen & Evacuation:** Prompts attendees to evacuate Entry Gate A to open air corridors.
  5. **Hazard Detour:** Wayfinding map automatically detours paths around Entry Gate A.
- **When MQ-135 drops below 3000:**
  - The buzzer and siren turn OFF automatically and return to green `SAFE`.

---

## 4. Arduino IDE Upload Steps

1. Open `esp32/stadiumsafe_esp32.ino` in **Arduino IDE**.
2. Select your board (**Tools ➔ Board ➔ ESP32 Dev Module**) and COM port (**Tools ➔ Port**).
3. Click **Upload** (➔).
4. Once uploaded, **close the Arduino Serial Monitor window** so Windows releases the COM port.
5. In Chrome or Edge, open `http://localhost:3000` and click **`⚡ CONNECT ESP32 COM`**.
