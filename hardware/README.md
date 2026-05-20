# AutoShop Hardware Integration Guide
## Complete A → Z Setup: Arduino Robot + Email Notifications

---

## 🏗️ SYSTEM ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────┐
│                    AutoShop System                            │
│                                                              │
│  ┌──────────────┐     WebSocket      ┌──────────────────┐   │
│  │  Web App      │◄──────────────────►│  Serial Bridge    │   │
│  │  (React)      │   ws://localhost   │  (Node.js)        │   │
│  │              │     :8765          │                    │   │
│  │  hardwareBridge               USB Serial              │   │
│  │  .ts          │                   │  /dev/ttyACM0      │   │
│  └──────────────┘                   └────────┬───────────┘   │
│                                              │               │
│                                              ▼               │
│                                     ┌──────────────────┐    │
│                                     │   Arduino Board   │    │
│                                     │   (LED Pin 13)    │    │
│                                     │                    │    │
│                                     │   autoshop_robot   │    │
│                                     │   .ino             │    │
│                                     └──────────────────┘    │
│                                                              │
│  ┌──────────────┐                   ┌──────────────────┐    │
│  │  Supabase     │                   │  Edge Functions   │    │
│  │  Database     │◄─────────────────►│  - purchase email │    │
│  │              │                   │  - daily report    │    │
│  └──────────────┘                   └──────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 PREREQUISITES

1. **Arduino Board** (Uno, Nano, Mega, or any compatible board)
2. **USB Cable** to connect Arduino to computer
3. **Arduino IDE** (download from https://www.arduino.cc/en/software)
4. **Node.js** v18+ installed on your computer
5. **Parrot OS / Linux** (or Windows/Mac with adjustments)

---

## STEP 1: Upload Arduino Sketch

### 1.1 Open Arduino IDE
```bash
# If not installed on Parrot OS:
sudo apt update
sudo apt install arduino
```

### 1.2 Open the Sketch
- Open Arduino IDE
- Go to **File → Open**
- Navigate to your project folder: `hardware/autoshop_robot/autoshop_robot.ino`
- The sketch will open in the IDE

### 1.3 Connect Arduino Board
- Plug your Arduino into your computer via USB
- In Arduino IDE: **Tools → Board** → Select your board (e.g., "Arduino Uno")
- In Arduino IDE: **Tools → Port** → Select the port (e.g., `/dev/ttyACM0`)

### 1.4 Upload
- Click the **Upload** button (→ arrow icon)
- Wait for "Done uploading" message
- You should see **3 quick LED blinks** on pin 13 — this means the Arduino is ready!

### 1.5 Verify with Serial Monitor
- Open **Tools → Serial Monitor**
- Set baud rate to **9600**
- You should see:
  ```
  LOG:AutoShop Robot Controller v1.0 READY
  STATUS:IDLE:System initialized
  ```
- Type `STATUS` and press Enter. You should get:
  ```
  STATUS:IDLE:blinks_remaining=0,uptime_ms=...
  ```
- Type `PICK:3` and press Enter. You should see the LED blink 3 times fast!

---

## STEP 2: Set Up Serial Bridge Server

### 2.1 Install Dependencies
```bash
cd hardware/
npm install
```

### 2.2 Find Your Arduino Port
```bash
# On Linux/Parrot OS:
ls /dev/ttyACM* /dev/ttyUSB*

# Usually it's /dev/ttyACM0 or /dev/ttyUSB0
```

### 2.3 Set Serial Port Permissions (Linux)
```bash
# Add yourself to the dialout group (one-time setup)
sudo usermod -a -G dialout $USER

# Then log out and log back in, OR run:
sudo chmod 666 /dev/ttyACM0
```

### 2.4 Start the Bridge
```bash
# With Arduino connected:
node serial-bridge.js /dev/ttyACM0 9600

# On Windows:
# node serial-bridge.js COM3 9600

# Without Arduino (simulation mode):
node serial-bridge.js /dev/null 9600
# OR
npm run start:sim
```

You should see:
```
╔══════════════════════════════════════════╗
║    AutoShop Serial Bridge Server v1.0    ║
╠══════════════════════════════════════════╣
║  Serial: /dev/ttyACM0                    ║
║  Baud:   9600                            ║
║  WS:     ws://localhost:8765             ║
╚══════════════════════════════════════════╝

[SERIAL] Connected to /dev/ttyACM0
```

---

## STEP 3: Run the Web Application

### 3.1 Start the Web App
In a **separate terminal**:
```bash
# From the project root directory
npm run dev
```

### 3.2 Open in Browser
- Navigate to `http://localhost:5173` (or whatever port Vite shows)
- The app will automatically try to connect to the serial bridge at `ws://localhost:8765`

---

## STEP 4: Test the Full Flow

### What Happens at Each Stage:

| Kiosk Stage | Arduino Command | LED Behavior | Serial Monitor Output |
|---|---|---|---|
| Customer picks cards | — | — | — |
| Checkout → Robot picks | `PICK:<count>` | Fast blinks × item count (150ms) | `ACK:PICK:3` → `LOG:Picking 3 items...` → `DONE:PICK` |
| Robot packs items | `PACK:<count>` | Medium blinks × item count (300ms) | `ACK:PACK:3` → `LOG:Packing 3 items...` → `DONE:PACK` |
| Conveyor starts | `CONVEYOR:START` | Steady continuous pulse (500ms) | `ACK:CONVEYOR:START` → `LOG:Conveyor belt activated` |
| Items at window | `DELIVER` | 3 long blinks (800ms) | `ACK:DELIVER` → `DONE:DELIVER` |
| Customer collects | `COLLECT:<count>` | Slow blinks × count (600ms) | `ACK:COLLECT:1` → `DONE:COLLECT` |
| Conveyor stops | `CONVEYOR:STOP` | LED off | `ACK:CONVEYOR:STOP` → `DONE:CONVEYOR` |

### 4.1 Walk Through the Kiosk
1. **Select language** on greeting screen
2. **Add items** (pick cards, use voice, or browse)
3. **Tap Checkout** → Watch Arduino LED blink fast (picking)
4. After picking → LED blinks medium (packing)
5. After packing → LED pulses steady (conveyor)
6. **Payment** → Choose M-Pesa or Cash
7. **Delivery** → LED blinks 3 times long (items at window)
8. **Collect** → LED blinks slow, then stops

### 4.2 Manual Testing via Serial Monitor
You can test commands directly in Arduino IDE's Serial Monitor:
```
PICK:5        → 5 fast blinks
PACK:3        → 3 medium blinks
CONVEYOR:START → continuous pulsing
CONVEYOR:STOP  → stop
DELIVER        → 3 long blinks
COLLECT:2      → 2 slow blinks
STATUS         → get current state
ESTOP          → emergency stop (rapid strobe)
RESET          → return to idle
```

---

## STEP 5: Email Notifications

### Purchase Notifications
Every successful payment automatically sends purchase details to **datamodb@gmail.com**. This includes:
- Order ID, total amount, payment method
- Complete list of purchased items with quantities and prices
- Timestamp

### Daily Reports (8 PM)
The daily report function sends a comprehensive summary including:
- Total revenue, orders, and customers
- Payment method breakdown (M-Pesa vs Cash)
- Top-selling products
- Low stock warnings
- Security alerts

### To Enable Email Delivery:
For emails to actually be **sent** (not just logged), you need a Resend API key:
1. Sign up at https://resend.com
2. Verify your email domain at https://resend.com/domains
3. Create an API key at https://resend.com/api-keys
4. Add the `RESEND_API_KEY` secret in Lovable

**Without Resend**: Notifications are still logged to `system_logs` table and visible in the admin dashboard.

### To Trigger Daily Report Manually:
```bash
curl -X POST https://tjivvnaekteabyzjiksc.supabase.co/functions/v1/send-daily-report \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### To Schedule Daily Report at 8 PM:
Add a cron job on your server:
```bash
# Edit crontab
crontab -e

# Add this line (8 PM East Africa Time = 5 PM UTC)
0 17 * * * curl -s -X POST https://tjivvnaekteabyzjiksc.supabase.co/functions/v1/send-daily-report \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqaXZ2bmFla3RlYWJ5emppa3NjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTQxNjgsImV4cCI6MjA4NTg5MDE2OH0.RtUmvJuWHOz19P2HaAMk7teuOoFOKuKCVNJeSLfksbU" \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## STEP 6: Running Without Arduino (Simulation Mode)

The system works **identically** without hardware:
- If the serial bridge can't find the Arduino, it enters **simulation mode**
- All commands are simulated with correct timing
- The web app's hardwareBridge silently falls back if the bridge isn't running
- **Zero changes to business logic** — the kiosk flow is identical

### Run in simulation:
```bash
cd hardware/
npm run start:sim
```

---

## STEP 7: Troubleshooting

### Arduino not detected
```bash
# Check if device is connected
ls /dev/ttyACM* /dev/ttyUSB*

# Check permissions
sudo chmod 666 /dev/ttyACM0

# Check if another program is using the port
fuser /dev/ttyACM0
```

### Serial bridge can't connect
- Make sure Arduino IDE Serial Monitor is **closed** (only one program can use the port)
- Verify baud rate matches (9600)
- Try unplugging and replugging the USB cable

### LED not blinking
- Verify pin 13 is the built-in LED on your board
- Check Serial Monitor for error messages
- Send `RESET` command to clear any stuck state

### Web app not connecting to bridge
- Ensure serial-bridge.js is running in a separate terminal
- Check that port 8765 is not blocked by firewall
- Look at browser console for WebSocket connection messages

---

## 🔒 SAFETY FEATURES

1. **Emergency Stop**: `ESTOP` command immediately halts all operations
2. **Command Timeout**: Any command that runs >30 seconds auto-stops
3. **Graceful Shutdown**: Ctrl+C on bridge server sends ESTOP to Arduino
4. **No Runaway Motors**: All blink sequences have finite counts (except conveyor, which needs explicit STOP)
5. **State Machine**: Arduino won't accept commands while in ESTOP (must RESET first)

---

## 🚀 SCALING PATH

When you're ready to add real hardware:

1. **Replace LED blinks with motor/actuator control** in the Arduino sketch
2. **Add more pins** for multiple motors, sensors, servos
3. **Multiple Arduino boards**: Run multiple serial-bridge instances on different ports
4. **WiFi transition**: Replace USB serial with ESP32 WiFi + WebSocket
5. **ROS integration**: When complexity requires it, the serial bridge can forward to ROS topics

The TypeScript hardwareBridge interface stays **exactly the same** — only the Arduino sketch changes.
