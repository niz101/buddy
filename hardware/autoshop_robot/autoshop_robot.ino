// /*
//  * AutoShop Robot Controller - Arduino Sketch
//  * ============================================
//  * 
//  * ARCHITECTURE:
//  *   - Arduino owns ONLY hardware control (LEDs, motors, actuators)
//  *   - TypeScript system is the master orchestrator
//  *   - Communication via USB Serial at 9600 baud
//  *   - Command pattern: CMD:PARAM1:PARAM2\n
//  *   - Response pattern: RES:TYPE:DATA\n
//  * 
//  * LED BLINK PATTERNS (using built-in LED pin 13):
//  *   - PICKING:  Fast blink (150ms) × item count
//  *   - PACKING:  Medium blink (300ms) × item count  
//  *   - CONVEYOR: Steady pulse (500ms on/off) continuous
//  *   - DELIVER:  3 long blinks (800ms)
//  *   - COLLECT:  Slow fade-like blinks × item count
//  *   - ESTOP:    Rapid strobe (50ms)
//  *   - IDLE:     Single heartbeat every 3 seconds
//  * 
//  * COMMAND PROTOCOL:
//  *   PICK:<count>       → Simulate picking <count> items
//  *   PACK:<count>       → Simulate packing <count> items
//  *   CONVEYOR:START     → Start conveyor belt
//  *   CONVEYOR:STOP      → Stop conveyor belt
//  *   DELIVER            → Items reached delivery window
//  *   COLLECT:<count>    → Customer collecting <count> items
//  *   STATUS             → Report current state
//  *   ESTOP              → Emergency stop all operations
//  *   RESET              → Reset to idle state
//  *   HEARTBEAT          → Respond with alive signal
//  * 
//  * RESPONSES:
//  *   ACK:<command>              → Command received and starting
//  *   DONE:<command>             → Command completed successfully
//  *   STATUS:<state>:<details>   → Current status report
//  *   ERROR:<code>:<message>     → Error occurred
//  *   LOG:<message>              → Informational log message
//  */

// #define LED_PIN 13
// #define SERIAL_BAUD 9600
// #define CMD_BUFFER_SIZE 64
// #define CMD_TIMEOUT_MS 30000  // 30 second command timeout

// // ========== STATE MACHINE ==========
// enum RobotState {
//   STATE_IDLE,
//   STATE_PICKING,
//   STATE_PACKING,
//   STATE_CONVEYOR_RUNNING,
//   STATE_DELIVERING,
//   STATE_COLLECTING,
//   STATE_ESTOP,
//   STATE_ERROR
// };

// // ========== GLOBAL STATE ==========
// RobotState currentState = STATE_IDLE;
// char cmdBuffer[CMD_BUFFER_SIZE];
// int cmdIndex = 0;
// bool commandComplete = false;

// // Non-blocking blink state
// unsigned long lastBlinkTime = 0;
// int blinkCount = 0;
// int blinksRemaining = 0;
// int blinkOnTime = 0;
// int blinkOffTime = 0;
// bool ledState = false;
// bool blinkPhaseOn = true;  // true = ON phase, false = OFF phase
// bool actionInProgress = false;
// String currentCommand = "";

// // Heartbeat
// unsigned long lastHeartbeat = 0;
// #define HEARTBEAT_INTERVAL 3000

// // Conveyor continuous blink
// bool conveyorActive = false;

// // Safety
// unsigned long commandStartTime = 0;
// bool commandTimedOut = false;

// // ========== SETUP ==========
// void setup() {
//   Serial.begin(SERIAL_BAUD);
//   pinMode(LED_PIN, OUTPUT);
//   digitalWrite(LED_PIN, LOW);
  
//   // Boot sequence - 3 quick blinks to signal ready
//   for (int i = 0; i < 3; i++) {
//     digitalWrite(LED_PIN, HIGH);
//     delay(100);
//     digitalWrite(LED_PIN, LOW);
//     delay(100);
//   }
  
//   Serial.println("LOG:AutoShop Robot Controller v1.0 READY");
//   Serial.println("STATUS:IDLE:System initialized");
// }

// // ========== MAIN LOOP (NON-BLOCKING) ==========
// void loop() {
//   // 1. Read serial input
//   readSerialInput();
  
//   // 2. Process complete command
//   if (commandComplete) {
//     processCommand();
//     commandComplete = false;
//     cmdIndex = 0;
//     memset(cmdBuffer, 0, CMD_BUFFER_SIZE);
//   }
  
//   // 3. Handle non-blocking LED animations
//   handleLedAnimation();
  
//   // 4. Heartbeat (only when idle)
//   //handleHeartbeat();
  
//   // 5. Safety: command timeout check
//   checkCommandTimeout();
// }

// // ========== SERIAL INPUT (NON-BLOCKING) ==========
// void readSerialInput() {
//   while (Serial.available() > 0) {
//     char c = Serial.read();
    
//     if (c == '\n' || c == '\r') {
//       if (cmdIndex > 0) {
//         cmdBuffer[cmdIndex] = '\0';
//         commandComplete = true;
//       }
//     } else if (cmdIndex < CMD_BUFFER_SIZE - 1) {
//       cmdBuffer[cmdIndex++] = c;
//     }
//   }
// }

// // ========== COMMAND PROCESSOR ==========
// void processCommand() {
//   String cmd = String(cmdBuffer);
//   cmd.trim();
  
//   if (cmd.length() == 0) return;
  
//   // Emergency stop always takes priority
//   if (cmd == "ESTOP") {
//     executeEstop();
//     return;
//   }
  
//   // If in ESTOP, only allow RESET
//   if (currentState == STATE_ESTOP) {
//     if (cmd == "RESET") {
//       executeReset();
//     } else {
//       Serial.println("ERROR:LOCKED:System in ESTOP. Send RESET first.");
//     }
//     return;
//   }
  
//   // Parse command and parameters
//   int colonIdx = cmd.indexOf(':');
//   String mainCmd = (colonIdx > 0) ? cmd.substring(0, colonIdx) : cmd;
//   String param = (colonIdx > 0) ? cmd.substring(colonIdx + 1) : "";
  
//   // Dispatch commands
//   if (mainCmd == "PICK") {
//     int count = param.toInt();
//     if (count <= 0) count = 1;
//     if (count > 20) count = 20;  // Safety limit
//     executePick(count);
//   }
//   else if (mainCmd == "PACK") {
//     int count = param.toInt();
//     if (count <= 0) count = 1;
//     if (count > 20) count = 20;
//     executePack(count);
//   }
//   else if (mainCmd == "CONVEYOR") {
//     if (param == "START") {
//       executeConveyorStart();
//     } else if (param == "STOP") {
//       executeConveyorStop();
//     } else {
//       Serial.println("ERROR:PARAM:CONVEYOR requires START or STOP");
//     }
//   }
//   else if (mainCmd == "DELIVER") {
//     executeDeliver();
//   }
//   else if (mainCmd == "COLLECT") {
//     int count = param.toInt();
//     if (count <= 0) count = 1;
//     executeCollect(count);
//   }
//   else if (mainCmd == "STATUS") {
//     reportStatus();
//   }
//   else if (mainCmd == "RESET") {
//     executeReset();
//   }
//   else if (mainCmd == "HEARTBEAT") {
//     Serial.println("ACK:HEARTBEAT:ALIVE");
//   }
//   else {
//     Serial.print("ERROR:UNKNOWN:Unrecognized command: ");
//     Serial.println(mainCmd);
//   }
// }

// // ========== COMMAND IMPLEMENTATIONS ==========

// void executePick(int count) {
//   currentState = STATE_PICKING;
//   currentCommand = "PICK";
//   commandStartTime = millis();
  
//   Serial.print("ACK:PICK:");
//   Serial.println(count);
//   Serial.print("LOG:Picking ");
//   Serial.print(count);
//   Serial.println(" item(s) from shelves...");
  
//   // Fast blinks × count (150ms on, 150ms off per blink)
//   startBlinkSequence(count, 150, 150);
// }

// void executePack(int count) {
//   currentState = STATE_PACKING;
//   currentCommand = "PACK";
//   commandStartTime = millis();
  
//   Serial.print("ACK:PACK:");
//   Serial.println(count);
//   Serial.print("LOG:Packing ");
//   Serial.print(count);
//   Serial.println(" item(s) into bag...");
  
//   // Medium blinks × count (300ms on, 300ms off per blink)
//   startBlinkSequence(count, 300, 300);
// }

// void executeConveyorStart() {
//   currentState = STATE_CONVEYOR_RUNNING;
//   currentCommand = "CONVEYOR";
//   commandStartTime = millis();
//   conveyorActive = true;
  
//   Serial.println("ACK:CONVEYOR:START");
//   Serial.println("LOG:Conveyor belt activated - moving goods to window...");
  
//   // Continuous steady pulse (500ms on, 500ms off)
//   startBlinkSequence(0, 500, 500);  // 0 = continuous
// }

// void executeConveyorStop() {
//   conveyorActive = false;
//   actionInProgress = false;
//   blinksRemaining = 0;
//   digitalWrite(LED_PIN, LOW);
//   ledState = false;
//   currentState = STATE_IDLE;
  
//   Serial.println("ACK:CONVEYOR:STOP");
//   Serial.println("DONE:CONVEYOR:Conveyor stopped");
//   Serial.println("LOG:Conveyor belt deactivated");
// }

// void executeDeliver() {
//   currentState = STATE_DELIVERING;
//   currentCommand = "DELIVER";
//   commandStartTime = millis();
  
//   Serial.println("ACK:DELIVER");
//   Serial.println("LOG:Items reached delivery window - 3 confirmation blinks...");
  
//   // 3 long blinks (800ms on, 400ms off)
//   startBlinkSequence(3, 800, 400);
// }

// void executeCollect(int count) {
//   currentState = STATE_COLLECTING;
//   currentCommand = "COLLECT";
//   commandStartTime = millis();
  
//   Serial.print("ACK:COLLECT:");
//   Serial.println(count);
//   Serial.print("LOG:Customer collecting ");
//   Serial.print(count);
//   Serial.println(" item(s) - slow confirmation blinks...");
  
//   // Slow blinks × count (600ms on, 600ms off)
//   startBlinkSequence(count, 600, 600);
// }

// void executeEstop() {
//   // Immediately halt everything
//   conveyorActive = false;
//   actionInProgress = false;
//   blinksRemaining = 0;
//   currentState = STATE_ESTOP;
//   currentCommand = "";
  
//   Serial.println("ACK:ESTOP");
//   Serial.println("LOG:!!! EMERGENCY STOP ACTIVATED !!!");
//   Serial.println("STATUS:ESTOP:All operations halted");
  
//   // Rapid strobe for 2 seconds then LED stays ON as warning
//   for (int i = 0; i < 20; i++) {
//     digitalWrite(LED_PIN, HIGH);
//     delay(50);
//     digitalWrite(LED_PIN, LOW);
//     delay(50);
//   }
//   digitalWrite(LED_PIN, HIGH);  // Stay ON as warning indicator
//   ledState = true;
// }

// void executeReset() {
//   conveyorActive = false;
//   actionInProgress = false;
//   blinksRemaining = 0;
//   currentState = STATE_IDLE;
//   currentCommand = "";
//   commandTimedOut = false;
//   digitalWrite(LED_PIN, LOW);
//   ledState = false;
  
//   Serial.println("ACK:RESET");
//   Serial.println("STATUS:IDLE:System reset to idle");
//   Serial.println("LOG:System reset complete - ready for commands");
// }

// void reportStatus() {
//   Serial.print("STATUS:");
//   switch (currentState) {
//     case STATE_IDLE:             Serial.print("IDLE"); break;
//     case STATE_PICKING:          Serial.print("PICKING"); break;
//     case STATE_PACKING:          Serial.print("PACKING"); break;
//     case STATE_CONVEYOR_RUNNING: Serial.print("CONVEYOR_RUNNING"); break;
//     case STATE_DELIVERING:       Serial.print("DELIVERING"); break;
//     case STATE_COLLECTING:       Serial.print("COLLECTING"); break;
//     case STATE_ESTOP:            Serial.print("ESTOP"); break;
//     case STATE_ERROR:            Serial.print("ERROR"); break;
//   }
//   Serial.print(":");
//   Serial.print("blinks_remaining=");
//   Serial.print(blinksRemaining);
//   Serial.print(",uptime_ms=");
//   Serial.println(millis());
// }

// // ========== NON-BLOCKING LED ANIMATION ==========

// void startBlinkSequence(int count, int onMs, int offMs) {
//   blinksRemaining = count;  // 0 = continuous
//   blinkOnTime = onMs;
//   blinkOffTime = offMs;
//   blinkPhaseOn = true;
//   actionInProgress = true;
//   lastBlinkTime = millis();
  
//   // Start with LED ON
//   digitalWrite(LED_PIN, HIGH);
//   ledState = true;
// }

// void handleLedAnimation() {
//   if (!actionInProgress) return;
  
//   unsigned long now = millis();
  
//   if (blinkPhaseOn) {
//     // LED is ON, waiting for onTime to elapse
//     if (now - lastBlinkTime >= (unsigned long)blinkOnTime) {
//       digitalWrite(LED_PIN, LOW);
//       ledState = false;
//       blinkPhaseOn = false;
//       lastBlinkTime = now;
//     }
//   } else {
//     // LED is OFF, waiting for offTime to elapse
//     if (now - lastBlinkTime >= (unsigned long)blinkOffTime) {
//       // One blink cycle completed
//       if (blinksRemaining > 0) {
//         blinksRemaining--;
//       }
      
//       if (blinksRemaining == 0 && !conveyorActive) {
//         // Sequence complete
//         actionInProgress = false;
//         digitalWrite(LED_PIN, LOW);
//         ledState = false;
        
//         // Report completion
//         Serial.print("DONE:");
//         Serial.println(currentCommand);
        
//         // Log per-action completion
//         if (currentCommand == "PICK") {
//           Serial.println("LOG:All items picked from shelves");
//         } else if (currentCommand == "PACK") {
//           Serial.println("LOG:All items packed into bag");
//         } else if (currentCommand == "DELIVER") {
//           Serial.println("LOG:Delivery confirmation complete");
//         } else if (currentCommand == "COLLECT") {
//           Serial.println("LOG:Collection confirmed by customer");
//         }
        
//         currentState = STATE_IDLE;
//         currentCommand = "";
//         return;
//       }
      
//       // Start next blink
//       digitalWrite(LED_PIN, HIGH);
//       ledState = true;
//       blinkPhaseOn = true;
//       lastBlinkTime = now;
//     }
//   }
// }

// // ========== HEARTBEAT ==========
// void handleHeartbeat() {
//   if (currentState == STATE_IDLE && !actionInProgress) {
//     unsigned long now = millis();
//     if (now - lastHeartbeat >= HEARTBEAT_INTERVAL) {
//       lastHeartbeat = now;
//       // Single quick blink as heartbeat
//       digitalWrite(LED_PIN, HIGH);
//       delay(50);
//       digitalWrite(LED_PIN, LOW);
//     }
//   }
// }

// // ========== SAFETY: COMMAND TIMEOUT ==========
// void checkCommandTimeout() {
//   if (actionInProgress && currentState != STATE_CONVEYOR_RUNNING) {
//     if (millis() - commandStartTime > CMD_TIMEOUT_MS) {
//       // Command taking too long - auto-stop
//       actionInProgress = false;
//       blinksRemaining = 0;
//       conveyorActive = false;
//       digitalWrite(LED_PIN, LOW);
//       ledState = false;
//       currentState = STATE_ERROR;
//       commandTimedOut = true;
      
//       Serial.print("ERROR:TIMEOUT:");
//       Serial.print(currentCommand);
//       Serial.println(" command timed out after 30s");
//       Serial.println("STATUS:ERROR:Command timeout - system needs RESET");
      
//       currentCommand = "";
//     }
//   }
// }
















// /*
// working only led l NOT BLINKING 
//  * AutoShop Robot Controller - STABLE NO-STRING VERSION
//  */

// #define LED_PIN 13
// #define SERIAL_BAUD 9600
// #define CMD_BUFFER_SIZE 64
// #define CMD_TIMEOUT_MS 30000

// // ========== STATE MACHINE ==========
// enum RobotState {
//   STATE_IDLE,
//   STATE_PICKING,
//   STATE_PACKING,
//   STATE_CONVEYOR_RUNNING,
//   STATE_DELIVERING,
//   STATE_COLLECTING,
//   STATE_ESTOP,
//   STATE_ERROR
// };

// RobotState currentState = STATE_IDLE;

// char cmdBuffer[CMD_BUFFER_SIZE];
// int cmdIndex = 0;
// bool commandComplete = false;

// unsigned long lastBlinkTime = 0;
// int blinksRemaining = 0;
// int blinkOnTime = 0;
// int blinkOffTime = 0;
// bool blinkPhaseOn = true;
// bool actionInProgress = false;

// char currentCommand[16] = "";

// bool conveyorActive = false;
// unsigned long commandStartTime = 0;
// bool commandTimedOut = false;

// // ========== SETUP ==========
// void setup() {
//   Serial.begin(SERIAL_BAUD);
//   pinMode(LED_PIN, OUTPUT);
//   digitalWrite(LED_PIN, LOW);

//   for (int i = 0; i < 3; i++) {
//     digitalWrite(LED_PIN, HIGH);
//     delay(100);
//     digitalWrite(LED_PIN, LOW);
//     delay(100);
//   }

//   Serial.println(F("LOG:AutoShop Robot Controller READY"));
//   Serial.println(F("STATUS:IDLE:System initialized"));
// }

// // ========== LOOP ==========
// void loop() {
//   readSerialInput();

//   if (commandComplete) {
//     processCommand();
//     commandComplete = false;
//     cmdIndex = 0;
//     memset(cmdBuffer, 0, CMD_BUFFER_SIZE);
//   }

//   handleLedAnimation();
//   checkCommandTimeout();
// }

// // ========== SERIAL ==========
// void readSerialInput() {
//   while (Serial.available()) {
//     char c = Serial.read();
//     if (c == '\n' || c == '\r') {
//       if (cmdIndex > 0) {
//         cmdBuffer[cmdIndex] = '\0';
//         commandComplete = true;
//       }
//     } else if (cmdIndex < CMD_BUFFER_SIZE - 1) {
//       cmdBuffer[cmdIndex++] = c;
//     }
//   }
// }

// // ========== COMMAND PARSER ==========
// void processCommand() {

//   if (strcmp(cmdBuffer, "ESTOP") == 0) {
//     executeEstop();
//     return;
//   }

//   if (currentState == STATE_ESTOP) {
//     if (strcmp(cmdBuffer, "RESET") == 0) {
//       executeReset();
//     } else {
//       Serial.println(F("ERROR:LOCKED:System in ESTOP. Send RESET."));
//     }
//     return;
//   }

//   char *mainCmd = strtok(cmdBuffer, ":");
//   char *param = strtok(NULL, ":");

//   if (!mainCmd) return;

//   if (strcmp(mainCmd, "PICK") == 0) {
//     int count = param ? atoi(param) : 1;
//     if (count < 1) count = 1;
//     if (count > 20) count = 20;
//     executePick(count);
//   }
//   else if (strcmp(mainCmd, "PACK") == 0) {
//     int count = param ? atoi(param) : 1;
//     if (count < 1) count = 1;
//     if (count > 20) count = 20;
//     executePack(count);
//   }
//   else if (strcmp(mainCmd, "CONVEYOR") == 0) {
//     if (param && strcmp(param, "START") == 0) {
//       executeConveyorStart();
//     } else if (param && strcmp(param, "STOP") == 0) {
//       executeConveyorStop();
//     } else {
//       Serial.println(F("ERROR:PARAM:CONVEYOR requires START/STOP"));
//     }
//   }
//   else if (strcmp(mainCmd, "DELIVER") == 0) {
//     executeDeliver();
//   }
//   else if (strcmp(mainCmd, "COLLECT") == 0) {
//     int count = param ? atoi(param) : 1;
//     if (count < 1) count = 1;
//     executeCollect(count);
//   }
//   else if (strcmp(mainCmd, "STATUS") == 0) {
//     reportStatus();
//   }
//   else if (strcmp(mainCmd, "RESET") == 0) {
//     executeReset();
//   }
//   else if (strcmp(mainCmd, "HEARTBEAT") == 0) {
//     Serial.println(F("ACK:HEARTBEAT:ALIVE"));
//   }
//   else {
//     Serial.println(F("ERROR:UNKNOWN:Unrecognized command"));
//   }
// }

// // ========== EXECUTIONS ==========
// void executePick(int count) {
//   currentState = STATE_PICKING;
//   strcpy(currentCommand, "PICK");
//   commandStartTime = millis();

//   Serial.print(F("ACK:PICK:"));
//   Serial.println(count);

//   startBlinkSequence(count, 150, 150);
// }

// void executePack(int count) {
//   currentState = STATE_PACKING;
//   strcpy(currentCommand, "PACK");
//   commandStartTime = millis();

//   Serial.print(F("ACK:PACK:"));
//   Serial.println(count);

//   startBlinkSequence(count, 300, 300);
// }

// void executeConveyorStart() {
//   currentState = STATE_CONVEYOR_RUNNING;
//   strcpy(currentCommand, "CONVEYOR");
//   commandStartTime = millis();
//   conveyorActive = true;

//   Serial.println(F("ACK:CONVEYOR:START"));
//   startBlinkSequence(0, 500, 500);
// }

// void executeConveyorStop() {
//   conveyorActive = false;
//   actionInProgress = false;
//   blinksRemaining = 0;
//   digitalWrite(LED_PIN, LOW);
//   currentState = STATE_IDLE;

//   Serial.println(F("DONE:CONVEYOR"));
// }

// void executeDeliver() {
//   currentState = STATE_DELIVERING;
//   strcpy(currentCommand, "DELIVER");
//   commandStartTime = millis();

//   Serial.println(F("ACK:DELIVER"));
//   startBlinkSequence(3, 800, 400);
// }

// void executeCollect(int count) {
//   currentState = STATE_COLLECTING;
//   strcpy(currentCommand, "COLLECT");
//   commandStartTime = millis();

//   Serial.print(F("ACK:COLLECT:"));
//   Serial.println(count);

//   startBlinkSequence(count, 600, 600);
// }

// void executeEstop() {
//   conveyorActive = false;
//   actionInProgress = false;
//   currentState = STATE_ESTOP;

//   Serial.println(F("ACK:ESTOP"));

//   for (int i = 0; i < 20; i++) {
//     digitalWrite(LED_PIN, HIGH);
//     delay(50);
//     digitalWrite(LED_PIN, LOW);
//     delay(50);
//   }
//   digitalWrite(LED_PIN, HIGH);
// }

// void executeReset() {
//   conveyorActive = false;
//   actionInProgress = false;
//   currentState = STATE_IDLE;
//   digitalWrite(LED_PIN, LOW);

//   Serial.println(F("ACK:RESET"));
// }

// // ========== LED ENGINE ==========
// void startBlinkSequence(int count, int onMs, int offMs) {
//   blinksRemaining = count;
//   blinkOnTime = onMs;
//   blinkOffTime = offMs;
//   blinkPhaseOn = true;
//   actionInProgress = true;
//   lastBlinkTime = millis();
//   digitalWrite(LED_PIN, HIGH);
// }

// void handleLedAnimation() {
//   if (!actionInProgress) return;

//   unsigned long now = millis();

//   if (blinkPhaseOn) {
//     if (now - lastBlinkTime >= (unsigned long)blinkOnTime) {
//       digitalWrite(LED_PIN, LOW);
//       blinkPhaseOn = false;
//       lastBlinkTime = now;
//     }
//   } else {
//     if (now - lastBlinkTime >= (unsigned long)blinkOffTime) {

//       if (blinksRemaining > 0) blinksRemaining--;

//       if (blinksRemaining == 0 && !conveyorActive) {
//         actionInProgress = false;
//         digitalWrite(LED_PIN, LOW);

//         Serial.print(F("DONE:"));
//         Serial.println(currentCommand);

//         currentState = STATE_IDLE;
//         return;
//       }

//       digitalWrite(LED_PIN, HIGH);
//       blinkPhaseOn = true;
//       lastBlinkTime = now;
//     }
//   }
// }

// // ========== SAFETY ==========
// void checkCommandTimeout() {
//   if (actionInProgress && currentState != STATE_CONVEYOR_RUNNING) {
//     if (millis() - commandStartTime > CMD_TIMEOUT_MS) {
//       actionInProgress = false;
//       conveyorActive = false;
//       digitalWrite(LED_PIN, LOW);
//       currentState = STATE_ERROR;

//       Serial.println(F("ERROR:TIMEOUT"));
//     }
//   }
// }

// void reportStatus() {
//   Serial.print(F("STATUS:"));
//   Serial.println((int)currentState);
// }














// // 100% working but commented to intergrate the physical shelf 
// /*
//  * AutoShop Robot Controller — FINAL LED L FIX
//  */

// #define LED_PIN LED_BUILTIN   // ⭐ ALWAYS correct for L LED
// #define SERIAL_BAUD 9600
// #define CMD_BUFFER_SIZE 64
// #define CMD_TIMEOUT_MS 30000

// enum RobotState {
//   STATE_IDLE,
//   STATE_PICKING,
//   STATE_PACKING,
//   STATE_CONVEYOR_RUNNING,
//   STATE_DELIVERING,
//   STATE_COLLECTING,
//   STATE_ESTOP,
//   STATE_ERROR
// };

// RobotState currentState = STATE_IDLE;

// char cmdBuffer[CMD_BUFFER_SIZE];
// int cmdIndex = 0;
// bool commandComplete = false;

// unsigned long lastBlinkTime = 0;
// int blinksRemaining = 0;
// int blinkOnTime = 0;
// int blinkOffTime = 0;
// bool blinkPhaseOn = true;
// bool actionInProgress = false;

// char currentCommand[16] = "";

// bool conveyorActive = false;
// unsigned long commandStartTime = 0;

// // ========== SETUP ==========
// void setup() {
//   Serial.begin(SERIAL_BAUD);

//   pinMode(LED_PIN, OUTPUT);
//   digitalWrite(LED_PIN, LOW);

//   // ⭐ Boot blink so we KNOW L works
//   for (int i = 0; i < 3; i++) {
//     digitalWrite(LED_PIN, HIGH);
//     delay(120);
//     digitalWrite(LED_PIN, LOW);
//     delay(120);
//   }

//   Serial.println(F("LOG:READY"));
//   Serial.println(F("STATUS:IDLE"));
// }

// // ========== LOOP ==========
// void loop() {
//   readSerialInput();

//   if (commandComplete) {
//     processCommand();
//     commandComplete = false;
//     cmdIndex = 0;
//     memset(cmdBuffer, 0, CMD_BUFFER_SIZE);
//   }

//   handleLedAnimation();
//   checkCommandTimeout();
// }

// // ========== SERIAL ==========
// void readSerialInput() {
//   while (Serial.available()) {
//     char c = Serial.read();
//     if (c == '\n' || c == '\r') {
//       if (cmdIndex > 0) {
//         cmdBuffer[cmdIndex] = '\0';
//         commandComplete = true;
//       }
//     } else if (cmdIndex < CMD_BUFFER_SIZE - 1) {
//       cmdBuffer[cmdIndex++] = c;
//     }
//   }
// }

// // ========== COMMAND PARSER ==========
// void processCommand() {

//   if (strcmp(cmdBuffer, "ESTOP") == 0) {
//     executeEstop();
//     return;
//   }

//   if (currentState == STATE_ESTOP) {
//     if (strcmp(cmdBuffer, "RESET") == 0) {
//       executeReset();
//     }
//     return;
//   }

//   char *mainCmd = strtok(cmdBuffer, ":");
//   char *param = strtok(NULL, ":");

//   if (!mainCmd) return;

//   if (strcmp(mainCmd, "PICK") == 0) {
//     executePick(param ? atoi(param) : 1);
//   }
//   else if (strcmp(mainCmd, "PACK") == 0) {
//     executePack(param ? atoi(param) : 1);
//   }
//   else if (strcmp(mainCmd, "CONVEYOR") == 0) {
//     if (param && strcmp(param, "START") == 0) executeConveyorStart();
//     else if (param && strcmp(param, "STOP") == 0) executeConveyorStop();
//   }
//   else if (strcmp(mainCmd, "DELIVER") == 0) {
//     executeDeliver();
//   }
//   else if (strcmp(mainCmd, "COLLECT") == 0) {
//     executeCollect(param ? atoi(param) : 1);
//   }
//   else if (strcmp(mainCmd, "STATUS") == 0) {
//     reportStatus();
//   }
//   else if (strcmp(mainCmd, "RESET") == 0) {
//     executeReset();
//   }
//   else if (strcmp(mainCmd, "HEARTBEAT") == 0) {
//     Serial.println(F("ACK:HEARTBEAT"));
//   }
// }

// // ========== ACTIONS ==========
// void executePick(int count) {
//   currentState = STATE_PICKING;
//   strcpy(currentCommand, "PICK");
//   commandStartTime = millis();

//   Serial.print(F("ACK:PICK:"));
//   Serial.println(count);

//   startBlinkSequence(count, 150, 150);
// }

// void executePack(int count) {
//   currentState = STATE_PACKING;
//   strcpy(currentCommand, "PACK");
//   commandStartTime = millis();

//   Serial.print(F("ACK:PACK:"));
//   Serial.println(count);

//   startBlinkSequence(count, 300, 300);
// }

// void executeConveyorStart() {
//   currentState = STATE_CONVEYOR_RUNNING;
//   strcpy(currentCommand, "CONVEYOR");
//   commandStartTime = millis();
//   conveyorActive = true;

//   Serial.println(F("ACK:CONVEYOR:START"));
//   startBlinkSequence(0, 500, 500); // infinite blink
// }

// void executeConveyorStop() {
//   conveyorActive = false;
//   actionInProgress = false;
//   digitalWrite(LED_PIN, LOW);
//   currentState = STATE_IDLE;

//   Serial.println(F("DONE:CONVEYOR"));
// }

// void executeDeliver() {
//   currentState = STATE_DELIVERING;
//   strcpy(currentCommand, "DELIVER");
//   commandStartTime = millis();

//   Serial.println(F("ACK:DELIVER"));
//   startBlinkSequence(3, 800, 400);
// }

// void executeCollect(int count) {
//   currentState = STATE_COLLECTING;
//   strcpy(currentCommand, "COLLECT");
//   commandStartTime = millis();

//   Serial.print(F("ACK:COLLECT:"));
//   Serial.println(count);

//   startBlinkSequence(count, 600, 600);
// }

// void executeEstop() {
//   conveyorActive = false;
//   actionInProgress = false;
//   currentState = STATE_ESTOP;

//   Serial.println(F("ACK:ESTOP"));

//   for (int i = 0; i < 20; i++) {
//     digitalWrite(LED_PIN, HIGH);
//     delay(50);
//     digitalWrite(LED_PIN, LOW);
//     delay(50);
//   }

//   digitalWrite(LED_PIN, HIGH);
// }

// void executeReset() {
//   conveyorActive = false;
//   actionInProgress = false;
//   currentState = STATE_IDLE;
//   digitalWrite(LED_PIN, LOW);

//   Serial.println(F("ACK:RESET"));
// }

// // ========== LED ENGINE ==========
// void startBlinkSequence(int count, int onMs, int offMs) {
//   blinksRemaining = count;
//   blinkOnTime = onMs;
//   blinkOffTime = offMs;
//   blinkPhaseOn = true;
//   actionInProgress = true;
//   lastBlinkTime = millis();
//   digitalWrite(LED_PIN, HIGH);
// }

// void handleLedAnimation() {
//   if (!actionInProgress) return;

//   unsigned long now = millis();

//   if (blinkPhaseOn) {
//     if (now - lastBlinkTime >= (unsigned long)blinkOnTime) {
//       digitalWrite(LED_PIN, LOW);
//       blinkPhaseOn = false;
//       lastBlinkTime = now;
//     }
//   } else {
//     if (now - lastBlinkTime >= (unsigned long)blinkOffTime) {

//       if (blinksRemaining > 0) blinksRemaining--;

//       if (blinksRemaining == 0 && !conveyorActive) {
//         actionInProgress = false;
//         digitalWrite(LED_PIN, LOW);

//         Serial.print(F("DONE:"));
//         Serial.println(currentCommand);

//         currentState = STATE_IDLE;
//         return;
//       }

//       digitalWrite(LED_PIN, HIGH);
//       blinkPhaseOn = true;
//       lastBlinkTime = now;
//     }
//   }
// }

// // ========== SAFETY ==========
// void checkCommandTimeout() {
//   if (actionInProgress && currentState != STATE_CONVEYOR_RUNNING) {
//     if (millis() - commandStartTime > CMD_TIMEOUT_MS) {
//       actionInProgress = false;
//       conveyorActive = false;
//       digitalWrite(LED_PIN, LOW);
//       currentState = STATE_ERROR;

//       Serial.println(F("ERROR:TIMEOUT"));
//     }
//   }
// }

// void reportStatus() {
//   Serial.print(F("STATUS:"));
//   Serial.println((int)currentState);
// }








// #include <Servo.h>

// // ================= SERVO ADDITION =================
// Servo servomotor;

// bool shelfHasRun = false;

// // ================= YOUR ORIGINAL CODE =================
// #define LED_PIN LED_BUILTIN   // ⭐ ALWAYS correct for L LED
// #define SERIAL_BAUD 9600
// #define CMD_BUFFER_SIZE 64
// #define CMD_TIMEOUT_MS 30000

// enum RobotState {
//   STATE_IDLE,
//   STATE_PICKING,
//   STATE_PACKING,
//   STATE_CONVEYOR_RUNNING,
//   STATE_DELIVERING,
//   STATE_COLLECTING,
//   STATE_ESTOP,
//   STATE_ERROR
// };

// RobotState currentState = STATE_IDLE;

// char cmdBuffer[CMD_BUFFER_SIZE];
// int cmdIndex = 0;
// bool commandComplete = false;

// unsigned long lastBlinkTime = 0;
// int blinksRemaining = 0;
// int blinkOnTime = 0;
// int blinkOffTime = 0;
// bool blinkPhaseOn = true;
// bool actionInProgress = false;

// char currentCommand[16] = "";

// bool conveyorActive = false;
// unsigned long commandStartTime = 0;

// // ================= SETUP =================
// void setup() {
//   Serial.begin(SERIAL_BAUD);

//   pinMode(LED_PIN, OUTPUT);
//   digitalWrite(LED_PIN, LOW);

//   // ⭐ SERVO INIT
//   servomotor.attach(9);
//   servomotor.write(25); // start closed

//   for (int i = 0; i < 3; i++) {
//     digitalWrite(LED_PIN, HIGH);
//     delay(120);
//     digitalWrite(LED_PIN, LOW);
//     delay(120);
//   }

//   Serial.println(F("LOG:READY"));
//   Serial.println(F("STATUS:IDLE"));
// }

// // ================= SHELF FUNCTION (YOUR ORIGINAL CODE UNTOUCHED) =================
// void shelf(){                              //this is for the shelve
//   //Open shelf
//   for(int i=25; i<=170; i++){
//     servomotor.write(i);
//     delay(25);
//   }
//   delay(1000);

//   //Close door
//   for(int i=170; i>=25; i--){
//     servomotor.write(i);
//     delay(25);
//   }
//   delay(3000);
// }

// // ================= LOOP =================
// void loop() {
//   readSerialInput();

//   if (commandComplete) {
//     processCommand();
//     commandComplete = false;
//     cmdIndex = 0;
//     memset(cmdBuffer, 0, CMD_BUFFER_SIZE);
//   }

//   handleLedAnimation();
//   checkCommandTimeout();
// }

// // ================= SERIAL =================
// void readSerialInput() {
//   while (Serial.available()) {
//     char c = Serial.read();
//     if (c == '\n' || c == '\r') {
//       if (cmdIndex > 0) {
//         cmdBuffer[cmdIndex] = '\0';
//         commandComplete = true;
//       }
//     } else if (cmdIndex < CMD_BUFFER_SIZE - 1) {
//       cmdBuffer[cmdIndex++] = c;
//     }
//   }
// }

// // ================= COMMAND PARSER =================
// void processCommand() {

//   if (strcmp(cmdBuffer, "ESTOP") == 0) {
//     executeEstop();
//     return;
//   }

//   if (currentState == STATE_ESTOP) {
//     if (strcmp(cmdBuffer, "RESET") == 0) {
//       executeReset();
//     }
//     return;
//   }

//   char *mainCmd = strtok(cmdBuffer, ":");
//   char *param = strtok(NULL, ":");

//   if (!mainCmd) return;

//   if (strcmp(mainCmd, "PICK") == 0) {
//     executePick(param ? atoi(param) : 1);
//   }
//   else if (strcmp(mainCmd, "PACK") == 0) {
//     executePack(param ? atoi(param) : 1);
//   }
//   else if (strcmp(mainCmd, "CONVEYOR") == 0) {
//     if (param && strcmp(param, "START") == 0) executeConveyorStart();
//     else if (param && strcmp(param, "STOP") == 0) executeConveyorStop();
//   }
//   else if (strcmp(mainCmd, "DELIVER") == 0) {
//     executeDeliver();
//   }
//   else if (strcmp(mainCmd, "COLLECT") == 0) {
//     executeCollect(param ? atoi(param) : 1);
//   }
//   else if (strcmp(mainCmd, "STATUS") == 0) {
//     reportStatus();
//   }
//   else if (strcmp(mainCmd, "RESET") == 0) {
//     executeReset();
//   }
//   else if (strcmp(mainCmd, "HEARTBEAT") == 0) {
//     Serial.println(F("ACK:HEARTBEAT"));
//   }
// }

// // ================= ACTIONS =================
// void executePick(int count) {
//   currentState = STATE_PICKING;
//   strcpy(currentCommand, "PICK");
//   commandStartTime = millis();

//   Serial.print(F("ACK:PICK:"));
//   Serial.println(count);

//   // ⭐ RUN SHELF ONLY ONCE PER PICK
//   if (!shelfHasRun) {
//     shelf();
//     shelfHasRun = true;
//   }

//   startBlinkSequence(count, 150, 150);
// }

// void executePack(int count) {
//   currentState = STATE_PACKING;
//   strcpy(currentCommand, "PACK");
//   commandStartTime = millis();

//   Serial.print(F("ACK:PACK:"));
//   Serial.println(count);

//   startBlinkSequence(count, 300, 300);
// }

// void executeConveyorStart() {
//   currentState = STATE_CONVEYOR_RUNNING;
//   strcpy(currentCommand, "CONVEYOR");
//   commandStartTime = millis();
//   conveyorActive = true;

//   Serial.println(F("ACK:CONVEYOR:START"));
//   startBlinkSequence(0, 500, 500);
// }

// void executeConveyorStop() {
//   conveyorActive = false;
//   actionInProgress = false;
//   digitalWrite(LED_PIN, LOW);
//   currentState = STATE_IDLE;

//   Serial.println(F("DONE:CONVEYOR"));
// }

// void executeDeliver() {
//   currentState = STATE_DELIVERING;
//   strcpy(currentCommand, "DELIVER");
//   commandStartTime = millis();

//   Serial.println(F("ACK:DELIVER"));
//   startBlinkSequence(3, 800, 400);
// }

// void executeCollect(int count) {
//   currentState = STATE_COLLECTING;
//   strcpy(currentCommand, "COLLECT");
//   commandStartTime = millis();

//   Serial.print(F("ACK:COLLECT:"));
//   Serial.println(count);

//   startBlinkSequence(count, 600, 600);
// }

// void executeEstop() {
//   conveyorActive = false;
//   actionInProgress = false;
//   currentState = STATE_ESTOP;

//   Serial.println(F("ACK:ESTOP"));

//   for (int i = 0; i < 20; i++) {
//     digitalWrite(LED_PIN, HIGH);
//     delay(50);
//     digitalWrite(LED_PIN, LOW);
//     delay(50);
//   }

//   digitalWrite(LED_PIN, HIGH);
// }

// void executeReset() {
//   conveyorActive = false;
//   actionInProgress = false;
//   currentState = STATE_IDLE;
//   digitalWrite(LED_PIN, LOW);

//   shelfHasRun = false;   // ⭐ RESET SHELF

//   Serial.println(F("ACK:RESET"));
// }

// // ================= LED ENGINE (UNCHANGED) =================
// void startBlinkSequence(int count, int onMs, int offMs) {
//   blinksRemaining = count;
//   blinkOnTime = onMs;
//   blinkOffTime = offMs;
//   blinkPhaseOn = true;
//   actionInProgress = true;
//   lastBlinkTime = millis();
//   digitalWrite(LED_PIN, HIGH);
// }

// void handleLedAnimation() {
//   if (!actionInProgress) return;

//   unsigned long now = millis();

//   if (blinkPhaseOn) {
//     if (now - lastBlinkTime >= (unsigned long)blinkOnTime) {
//       digitalWrite(LED_PIN, LOW);
//       blinkPhaseOn = false;
//       lastBlinkTime = now;
//     }
//   } else {
//     if (now - lastBlinkTime >= (unsigned long)blinkOffTime) {

//       if (blinksRemaining > 0) blinksRemaining--;

//       if (blinksRemaining == 0 && !conveyorActive) {
//         actionInProgress = false;
//         digitalWrite(LED_PIN, LOW);

//         Serial.print(F("DONE:"));
//         Serial.println(currentCommand);

//         currentState = STATE_IDLE;
//         return;
//       }

//       digitalWrite(LED_PIN, HIGH);
//       blinkPhaseOn = true;
//       lastBlinkTime = now;
//     }
//   }
// }

// // ================= SAFETY =================
// void checkCommandTimeout() {
//   if (actionInProgress && currentState != STATE_CONVEYOR_RUNNING) {
//     if (millis() - commandStartTime > CMD_TIMEOUT_MS) {
//       actionInProgress = false;
//       conveyorActive = false;
//       digitalWrite(LED_PIN, LOW);
//       currentState = STATE_ERROR;

//       Serial.println(F("ERROR:TIMEOUT"));
//     }
//   }
// }

// void reportStatus() {
//   Serial.print(F("STATUS:"));
//   Serial.println((int)currentState);
// }












// #include <Servo.h>

// // ================= SERVO ADDITION =================
// Servo servomotor;

// // ================= YOUR ORIGINAL CODE =================
// #define LED_PIN LED_BUILTIN
// #define SERIAL_BAUD 9600
// #define CMD_BUFFER_SIZE 64
// #define CMD_TIMEOUT_MS 30000

// enum RobotState {
//   STATE_IDLE,
//   STATE_PICKING,
//   STATE_PACKING,
//   STATE_CONVEYOR_RUNNING,
//   STATE_DELIVERING,
//   STATE_COLLECTING,
//   STATE_ESTOP,
//   STATE_ERROR
// };

// RobotState currentState = STATE_IDLE;

// char cmdBuffer[CMD_BUFFER_SIZE];
// int cmdIndex = 0;
// bool commandComplete = false;

// unsigned long lastBlinkTime = 0;
// int blinksRemaining = 0;
// int blinkOnTime = 0;
// int blinkOffTime = 0;
// bool blinkPhaseOn = true;
// bool actionInProgress = false;

// char currentCommand[16] = "";

// bool conveyorActive = false;
// unsigned long commandStartTime = 0;

// // ================= SETUP =================
// void setup() {
//   Serial.begin(SERIAL_BAUD);

//   pinMode(LED_PIN, OUTPUT);
//   digitalWrite(LED_PIN, LOW);

//   // ================= SERVO INIT =================
//   servomotor.attach(9);
//   servomotor.write(25);

//   // ⭐ Boot blink so we KNOW L works
//   for (int i = 0; i < 3; i++) {
//     digitalWrite(LED_PIN, HIGH);
//     delay(120);
//     digitalWrite(LED_PIN, LOW);
//     delay(120);
//   }

//   Serial.println(F("LOG:READY"));
//   Serial.println(F("STATUS:IDLE"));
// }

// // ================= SHELF FUNCTION =================
// void shelf(){                              //this is for the shelve

//   //Open shelf
//   for(int i=25; i<=170; i++){
//     servomotor.write(i);
//     delay(25);
//   }

//   delay(1000);

//   //Close door
//   for(int i=170; i>=25; i--){
//     servomotor.write(i);
//     delay(25);
//   }

//   delay(3000);
// }

// // ================= LOOP =================
// void loop() {

//   readSerialInput();

//   if (commandComplete) {
//     processCommand();
//     commandComplete = false;
//     cmdIndex = 0;
//     memset(cmdBuffer, 0, CMD_BUFFER_SIZE);
//   }

//   handleLedAnimation();
//   checkCommandTimeout();
// }

// // ================= SERIAL =================
// void readSerialInput() {

//   while (Serial.available()) {

//     char c = Serial.read();

//     if (c == '\n' || c == '\r') {

//       if (cmdIndex > 0) {
//         cmdBuffer[cmdIndex] = '\0';
//         commandComplete = true;
//       }

//     } else if (cmdIndex < CMD_BUFFER_SIZE - 1) {

//       cmdBuffer[cmdIndex++] = c;
//     }
//   }
// }

// // ================= COMMAND PARSER =================
// void processCommand() {

//   if (strcmp(cmdBuffer, "ESTOP") == 0) {
//     executeEstop();
//     return;
//   }

//   if (currentState == STATE_ESTOP) {

//     if (strcmp(cmdBuffer, "RESET") == 0) {
//       executeReset();
//     }

//     return;
//   }

//   char *mainCmd = strtok(cmdBuffer, ":");
//   char *param = strtok(NULL, ":");

//   if (!mainCmd) return;

//   if (strcmp(mainCmd, "PICK") == 0) {
//     executePick(param ? atoi(param) : 1);
//   }

//   else if (strcmp(mainCmd, "PACK") == 0) {
//     executePack(param ? atoi(param) : 1);
//   }

//   else if (strcmp(mainCmd, "CONVEYOR") == 0) {

//     if (param && strcmp(param, "START") == 0)
//       executeConveyorStart();

//     else if (param && strcmp(param, "STOP") == 0)
//       executeConveyorStop();
//   }

//   else if (strcmp(mainCmd, "DELIVER") == 0) {
//     executeDeliver();
//   }

//   else if (strcmp(mainCmd, "COLLECT") == 0) {
//     executeCollect(param ? atoi(param) : 1);
//   }

//   else if (strcmp(mainCmd, "STATUS") == 0) {
//     reportStatus();
//   }

//   else if (strcmp(mainCmd, "RESET") == 0) {
//     executeReset();
//   }

//   else if (strcmp(mainCmd, "HEARTBEAT") == 0) {
//     Serial.println(F("ACK:HEARTBEAT"));
//   }
// }

// // ================= ACTIONS =================
// void executePick(int count) {

//   // ================= RUN SHELF =================
//   shelf();

//   currentState = STATE_PICKING;

//   strcpy(currentCommand, "PICK");

//   commandStartTime = millis();

//   Serial.print(F("ACK:PICK:"));
//   Serial.println(count);

//   startBlinkSequence(count, 150, 150);
// }

// void executePack(int count) {

//   currentState = STATE_PACKING;

//   strcpy(currentCommand, "PACK");

//   commandStartTime = millis();

//   Serial.print(F("ACK:PACK:"));
//   Serial.println(count);

//   startBlinkSequence(count, 300, 300);
// }

// void executeConveyorStart() {

//   currentState = STATE_CONVEYOR_RUNNING;

//   strcpy(currentCommand, "CONVEYOR");

//   commandStartTime = millis();

//   conveyorActive = true;

//   Serial.println(F("ACK:CONVEYOR:START"));

//   startBlinkSequence(0, 500, 500);
// }

// void executeConveyorStop() {

//   conveyorActive = false;

//   actionInProgress = false;

//   digitalWrite(LED_PIN, LOW);

//   currentState = STATE_IDLE;

//   Serial.println(F("DONE:CONVEYOR"));
// }

// void executeDeliver() {

//   currentState = STATE_DELIVERING;

//   strcpy(currentCommand, "DELIVER");

//   commandStartTime = millis();

//   Serial.println(F("ACK:DELIVER"));

//   startBlinkSequence(3, 800, 400);
// }

// void executeCollect(int count) {

//   currentState = STATE_COLLECTING;

//   strcpy(currentCommand, "COLLECT");

//   commandStartTime = millis();

//   Serial.print(F("ACK:COLLECT:"));
//   Serial.println(count);

//   startBlinkSequence(count, 600, 600);
// }

// void executeEstop() {

//   conveyorActive = false;

//   actionInProgress = false;

//   currentState = STATE_ESTOP;

//   Serial.println(F("ACK:ESTOP"));

//   for (int i = 0; i < 20; i++) {

//     digitalWrite(LED_PIN, HIGH);
//     delay(50);

//     digitalWrite(LED_PIN, LOW);
//     delay(50);
//   }

//   digitalWrite(LED_PIN, HIGH);
// }

// void executeReset() {

//   conveyorActive = false;

//   actionInProgress = false;

//   currentState = STATE_IDLE;

//   digitalWrite(LED_PIN, LOW);

//   Serial.println(F("ACK:RESET"));
// }

// // ================= LED ENGINE =================
// void startBlinkSequence(int count, int onMs, int offMs) {

//   blinksRemaining = count;

//   blinkOnTime = onMs;

//   blinkOffTime = offMs;

//   blinkPhaseOn = true;

//   actionInProgress = true;

//   lastBlinkTime = millis();

//   digitalWrite(LED_PIN, HIGH);
// }

// void handleLedAnimation() {

//   if (!actionInProgress) return;

//   unsigned long now = millis();

//   if (blinkPhaseOn) {

//     if (now - lastBlinkTime >= (unsigned long)blinkOnTime) {

//       digitalWrite(LED_PIN, LOW);

//       blinkPhaseOn = false;

//       lastBlinkTime = now;
//     }

//   } else {

//     if (now - lastBlinkTime >= (unsigned long)blinkOffTime) {

//       if (blinksRemaining > 0)
//         blinksRemaining--;

//       if (blinksRemaining == 0 && !conveyorActive) {

//         actionInProgress = false;

//         digitalWrite(LED_PIN, LOW);

//         Serial.print(F("DONE:"));
//         Serial.println(currentCommand);

//         currentState = STATE_IDLE;

//         return;
//       }

//       digitalWrite(LED_PIN, HIGH);

//       blinkPhaseOn = true;

//       lastBlinkTime = now;
//     }
//   }
// }

// // ================= SAFETY =================
// void checkCommandTimeout() {

//   if (actionInProgress && currentState != STATE_CONVEYOR_RUNNING) {

//     if (millis() - commandStartTime > CMD_TIMEOUT_MS) {

//       actionInProgress = false;

//       conveyorActive = false;

//       digitalWrite(LED_PIN, LOW);

//       currentState = STATE_ERROR;

//       Serial.println(F("ERROR:TIMEOUT"));
//     }
//   }
// }

// void reportStatus() {

//   Serial.print(F("STATUS:"));

//   Serial.println((int)currentState);
// }








// #include <Servo.h>

// // ================= SERVO ADDITION =================
// Servo servomotor;

// // ================= ORIGINAL CODE =================
// #define LED_PIN LED_BUILTIN
// #define SERIAL_BAUD 9600
// #define CMD_BUFFER_SIZE 64
// #define CMD_TIMEOUT_MS 30000

// enum RobotState {
//   STATE_IDLE,
//   STATE_PICKING,
//   STATE_PACKING,
//   STATE_CONVEYOR_RUNNING,
//   STATE_DELIVERING,
//   STATE_COLLECTING,
//   STATE_ESTOP,
//   STATE_ERROR
// };

// RobotState currentState = STATE_IDLE;

// char cmdBuffer[CMD_BUFFER_SIZE];
// int cmdIndex = 0;
// bool commandComplete = false;

// unsigned long lastBlinkTime = 0;
// int blinksRemaining = 0;
// int blinkOnTime = 0;
// int blinkOffTime = 0;
// bool blinkPhaseOn = true;
// bool actionInProgress = false;

// char currentCommand[16] = "";

// bool conveyorActive = false;
// unsigned long commandStartTime = 0;

// // ================= SETUP =================
// void setup() {

//   Serial.begin(SERIAL_BAUD);

//   pinMode(LED_PIN, OUTPUT);
//   digitalWrite(LED_PIN, LOW);

//   // ================= SERVO INIT =================
//   servomotor.attach(9);
//   servomotor.write(25);
//   delay(500);
//   servomotor.detach();

//   // ================= BOOT BLINK =================
//   for (int i = 0; i < 3; i++) {
//     digitalWrite(LED_PIN, HIGH);
//     delay(120);

//     digitalWrite(LED_PIN, LOW);
//     delay(120);
//   }

//   Serial.println(F("LOG:READY"));
//   Serial.println(F("STATUS:IDLE"));
// }

// // ================= SHELF FUNCTION =================
// void shelf(){

//   servomotor.attach(9);

//   // ================= OPEN SHELF =================
//   for(int i = 25; i <= 170; i++){
//     servomotor.write(i);
//     delay(25);
//   }

//   delay(1000);

//   // ================= CLOSE SHELF =================
//   for(int i = 170; i >= 25; i--){
//     servomotor.write(i);
//     delay(25);
//   }

//   delay(500);

//   servomotor.detach();
// }

// // ================= LOOP =================
// void loop() {

//   readSerialInput();

//   if (commandComplete) {

//     processCommand();

//     commandComplete = false;
//     cmdIndex = 0;

//     memset(cmdBuffer, 0, CMD_BUFFER_SIZE);
//   }

//   handleLedAnimation();

//   checkCommandTimeout();
// }

// // ================= SERIAL =================
// void readSerialInput() {

//   while (Serial.available()) {

//     char c = Serial.read();

//     if (c == '\n' || c == '\r') {

//       if (cmdIndex > 0) {

//         cmdBuffer[cmdIndex] = '\0';

//         commandComplete = true;
//       }

//     } else if (cmdIndex < CMD_BUFFER_SIZE - 1) {

//       cmdBuffer[cmdIndex++] = c;
//     }
//   }
// }

// // ================= COMMAND PARSER =================
// void processCommand() {

//   if (strcmp(cmdBuffer, "ESTOP") == 0) {

//     executeEstop();

//     return;
//   }

//   if (currentState == STATE_ESTOP) {

//     if (strcmp(cmdBuffer, "RESET") == 0) {
//       executeReset();
//     }

//     return;
//   }

//   char *mainCmd = strtok(cmdBuffer, ":");
//   char *param = strtok(NULL, ":");

//   if (!mainCmd) return;

//   if (strcmp(mainCmd, "PICK") == 0) {

//     executePick(param ? atoi(param) : 1);
//   }

//   else if (strcmp(mainCmd, "PACK") == 0) {

//     executePack(param ? atoi(param) : 1);
//   }

//   else if (strcmp(mainCmd, "CONVEYOR") == 0) {

//     if (param && strcmp(param, "START") == 0) {
//       executeConveyorStart();
//     }

//     else if (param && strcmp(param, "STOP") == 0) {
//       executeConveyorStop();
//     }
//   }

//   else if (strcmp(mainCmd, "DELIVER") == 0) {

//     executeDeliver();
//   }

//   else if (strcmp(mainCmd, "COLLECT") == 0) {

//     executeCollect(param ? atoi(param) : 1);
//   }

//   else if (strcmp(mainCmd, "STATUS") == 0) {

//     reportStatus();
//   }

//   else if (strcmp(mainCmd, "RESET") == 0) {

//     executeReset();
//   }

//   else if (strcmp(mainCmd, "HEARTBEAT") == 0) {

//     Serial.println(F("ACK:HEARTBEAT"));
//   }
// }

// // // ================= ACTIONS =================
// // void executePick(int count) {

// //   Serial.println(F("EXECUTE PICK"));

// //   // ================= RUN SERVO SHELF =================
// //   shelf();

// //   currentState = STATE_PICKING;

// //   strcpy(currentCommand, "PICK");

// //   commandStartTime = millis();

// //   Serial.print(F("ACK:PICK:"));
// //   Serial.println(count);

// //   startBlinkSequence(count, 150, 150);
// // }

// void executePick(int count) {

//   Serial.println("EXECUTE PICK HIT");

//   // ===== FORCE SERVO TEST =====
//   servomotor.write(25);
//   delay(1000);

//   servomotor.write(170);
//   delay(3000);

//   servomotor.write(25);
//   delay(3000);

//   Serial.println("SERVO FINISHED");

//   // ===== ORIGINAL CODE =====
//   currentState = STATE_PICKING;

//   strcpy(currentCommand, "PICK");

//   commandStartTime = millis();

//   Serial.print(F("ACK:PICK:"));
//   Serial.println(count);

//   startBlinkSequence(count, 150, 150);
// }

// void executePack(int count) {

//   currentState = STATE_PACKING;

//   strcpy(currentCommand, "PACK");

//   commandStartTime = millis();

//   Serial.print(F("ACK:PACK:"));
//   Serial.println(count);

//   startBlinkSequence(count, 300, 300);
// }

// void executeConveyorStart() {

//   currentState = STATE_CONVEYOR_RUNNING;

//   strcpy(currentCommand, "CONVEYOR");

//   commandStartTime = millis();

//   conveyorActive = true;

//   Serial.println(F("ACK:CONVEYOR:START"));

//   startBlinkSequence(0, 500, 500);
// }

// void executeConveyorStop() {

//   conveyorActive = false;

//   actionInProgress = false;

//   digitalWrite(LED_PIN, LOW);

//   currentState = STATE_IDLE;

//   Serial.println(F("DONE:CONVEYOR"));
// }

// void executeDeliver() {

//   currentState = STATE_DELIVERING;

//   strcpy(currentCommand, "DELIVER");

//   commandStartTime = millis();

//   Serial.println(F("ACK:DELIVER"));

//   startBlinkSequence(3, 800, 400);
// }

// void executeCollect(int count) {

//   currentState = STATE_COLLECTING;

//   strcpy(currentCommand, "COLLECT");

//   commandStartTime = millis();

//   Serial.print(F("ACK:COLLECT:"));
//   Serial.println(count);

//   startBlinkSequence(count, 600, 600);
// }

// void executeEstop() {

//   conveyorActive = false;

//   actionInProgress = false;

//   currentState = STATE_ESTOP;

//   Serial.println(F("ACK:ESTOP"));

//   for (int i = 0; i < 20; i++) {

//     digitalWrite(LED_PIN, HIGH);
//     delay(50);

//     digitalWrite(LED_PIN, LOW);
//     delay(50);
//   }

//   digitalWrite(LED_PIN, HIGH);
// }

// void executeReset() {

//   conveyorActive = false;

//   actionInProgress = false;

//   currentState = STATE_IDLE;

//   digitalWrite(LED_PIN, LOW);

//   Serial.println(F("ACK:RESET"));
// }

// // ================= LED ENGINE =================
// void startBlinkSequence(int count, int onMs, int offMs) {

//   blinksRemaining = count;

//   blinkOnTime = onMs;

//   blinkOffTime = offMs;

//   blinkPhaseOn = true;

//   actionInProgress = true;

//   lastBlinkTime = millis();

//   digitalWrite(LED_PIN, HIGH);
// }

// void handleLedAnimation() {

//   if (!actionInProgress) return;

//   unsigned long now = millis();

//   if (blinkPhaseOn) {

//     if (now - lastBlinkTime >= (unsigned long)blinkOnTime) {

//       digitalWrite(LED_PIN, LOW);

//       blinkPhaseOn = false;

//       lastBlinkTime = now;
//     }

//   } else {

//     if (now - lastBlinkTime >= (unsigned long)blinkOffTime) {

//       if (blinksRemaining > 0) {
//         blinksRemaining--;
//       }

//       if (blinksRemaining == 0 && !conveyorActive) {

//         actionInProgress = false;

//         digitalWrite(LED_PIN, LOW);

//         Serial.print(F("DONE:"));
//         Serial.println(currentCommand);

//         currentState = STATE_IDLE;

//         return;
//       }

//       digitalWrite(LED_PIN, HIGH);

//       blinkPhaseOn = true;

//       lastBlinkTime = now;
//     }
//   }
// }

// // ================= SAFETY =================
// void checkCommandTimeout() {

//   if (actionInProgress && currentState != STATE_CONVEYOR_RUNNING) {

//     if (millis() - commandStartTime > CMD_TIMEOUT_MS) {

//       actionInProgress = false;

//       conveyorActive = false;

//       digitalWrite(LED_PIN, LOW);

//       currentState = STATE_ERROR;

//       Serial.println(F("ERROR:TIMEOUT"));
//     }
//   }
// }

// // ================= STATUS =================
// void reportStatus() {

//   Serial.print(F("STATUS:"));

//   Serial.println((int)currentState);
// }






















// /*
//  * AutoShop Robot Controller — REAL HARDWARE
//  *  - Servo (shelf) on pin 9
//  *  - DC motor (conveyor) on ENA=5, IN1=7, IN2=8
//  *  - LED on built-in L
//  */

// #include <Servo.h>

// #define LED_PIN     LED_BUILTIN
// #define SERVO_PIN   9
// #define ENA         5
// #define IN1         7
// #define IN2         8
// #define MOTOR_SPEED 150

// #define SERIAL_BAUD     9600
// #define CMD_BUFFER_SIZE 64
// #define CMD_TIMEOUT_MS  30000

// Servo servomotor;

// enum RobotState {
//   STATE_IDLE, STATE_PICKING, STATE_PACKING,
//   STATE_CONVEYOR_RUNNING, STATE_DELIVERING,
//   STATE_COLLECTING, STATE_ESTOP, STATE_ERROR
// };
// RobotState currentState = STATE_IDLE;

// char cmdBuffer[CMD_BUFFER_SIZE];
// int  cmdIndex = 0;
// bool commandComplete = false;

// unsigned long lastBlinkTime = 0;
// int  blinksRemaining = 0;
// int  blinkOnTime = 0;
// int  blinkOffTime = 0;
// bool blinkPhaseOn = true;
// bool actionInProgress = false;

// char currentCommand[16] = "";
// bool conveyorActive = false;
// unsigned long commandStartTime = 0;

// // ========== SETUP ==========
// void setup() {
//   Serial.begin(SERIAL_BAUD);

//   pinMode(LED_PIN, OUTPUT);
//   digitalWrite(LED_PIN, LOW);

//   pinMode(IN1, OUTPUT);
//   pinMode(IN2, OUTPUT);
//   pinMode(ENA, OUTPUT);
//   motorStop();

//   servomotor.attach(SERVO_PIN);
//   servomotor.write(25);

//   for (int i = 0; i < 3; i++) {
//     digitalWrite(LED_PIN, HIGH); delay(120);
//     digitalWrite(LED_PIN, LOW);  delay(120);
//   }

//   Serial.println(F("LOG:READY"));
//   Serial.println(F("STATUS:IDLE"));
// }

// // ========== LOOP ==========
// void loop() {
//   readSerialInput();

//   if (commandComplete) {
//     processCommand();
//     commandComplete = false;
//     cmdIndex = 0;
//     memset(cmdBuffer, 0, CMD_BUFFER_SIZE);
//   }

//   handleLedAnimation();
//   checkCommandTimeout();
// }

// // ========== SERIAL ==========
// void readSerialInput() {
//   while (Serial.available()) {
//     char c = Serial.read();
//     if (c == '\n' || c == '\r') {
//       if (cmdIndex > 0) {
//         cmdBuffer[cmdIndex] = '\0';
//         commandComplete = true;
//       }
//     } else if (cmdIndex < CMD_BUFFER_SIZE - 1) {
//       cmdBuffer[cmdIndex++] = c;
//     }
//   }
// }

// // ========== COMMAND PARSER ==========
// void processCommand() {
//   if (strcmp(cmdBuffer, "ESTOP") == 0) { executeEstop(); return; }

//   if (currentState == STATE_ESTOP) {
//     if (strcmp(cmdBuffer, "RESET") == 0) executeReset();
//     return;
//   }

//   char *mainCmd = strtok(cmdBuffer, ":");
//   char *param   = strtok(NULL, ":");
//   if (!mainCmd) return;

//   if      (strcmp(mainCmd, "PICK")     == 0) executePick(param ? atoi(param) : 1);
//   else if (strcmp(mainCmd, "PACK")     == 0) executePack(param ? atoi(param) : 1);
//   else if (strcmp(mainCmd, "CONVEYOR") == 0) {
//     if      (param && strcmp(param, "START") == 0) executeConveyorStart();
//     else if (param && strcmp(param, "STOP")  == 0) executeConveyorStop();
//   }
//   else if (strcmp(mainCmd, "DELIVER")  == 0) executeDeliver();
//   else if (strcmp(mainCmd, "COLLECT")  == 0) executeCollect(param ? atoi(param) : 1);
//   else if (strcmp(mainCmd, "STATUS")   == 0) reportStatus();
//   else if (strcmp(mainCmd, "RESET")    == 0) executeReset();
//   else if (strcmp(mainCmd, "HEARTBEAT")== 0) Serial.println(F("ACK:HEARTBEAT"));
// }

// // ========== SHELF (SERVO) — runs once per call ==========
// void shelf() {
//   digitalWrite(LED_PIN, HIGH);

//   for (int i = 25; i <= 170; i++) {
//     servomotor.write(i);
//     delay(25);
//   }
//   delay(1000);

//   for (int i = 170; i >= 25; i--) {
//     servomotor.write(i);
//     delay(25);
//   }
//   delay(3000);

//   digitalWrite(LED_PIN, LOW);
// }

// // ========== MOTOR (CONVEYOR) ==========
// void motorForward() {
//   analogWrite(ENA, MOTOR_SPEED);
//   digitalWrite(IN1, HIGH);
//   digitalWrite(IN2, LOW);
// }

// void motorStop() {
//   digitalWrite(ENA, LOW);
//   digitalWrite(IN1, LOW);
//   digitalWrite(IN2, LOW);
// }

// // ========== ACTIONS ==========
// void executePick(int count) {
//   currentState = STATE_PICKING;
//   strcpy(currentCommand, "PICK");
//   commandStartTime = millis();

//   Serial.print(F("ACK:PICK:"));
//   Serial.println(count);
//   Serial.println(F("LOG:Shelf opening..."));

//   shelf();  // ONE shelf cycle per PICK

//   Serial.println(F("DONE:PICK"));
//   currentState = STATE_IDLE;
//   strcpy(currentCommand, "");
// }

// void executePack(int count) {
//   currentState = STATE_PACKING;
//   strcpy(currentCommand, "PACK");
//   commandStartTime = millis();

//   Serial.print(F("ACK:PACK:"));
//   Serial.println(count);

//   startBlinkSequence(count, 300, 300);
// }

// void executeConveyorStart() {
//   currentState = STATE_CONVEYOR_RUNNING;
//   strcpy(currentCommand, "CONVEYOR");
//   commandStartTime = millis();
//   conveyorActive = true;

//   motorForward();

//   Serial.println(F("ACK:CONVEYOR:START"));
//   Serial.println(F("LOG:Conveyor running"));

//   startBlinkSequence(0, 500, 500);
// }

// void executeConveyorStop() {
//   conveyorActive = false;
//   actionInProgress = false;
//   motorStop();
//   digitalWrite(LED_PIN, LOW);
//   currentState = STATE_IDLE;

//   Serial.println(F("DONE:CONVEYOR"));
//   Serial.println(F("LOG:Conveyor stopped"));
// }

// void executeDeliver() {
//   currentState = STATE_DELIVERING;
//   strcpy(currentCommand, "DELIVER");
//   commandStartTime = millis();

//   Serial.println(F("ACK:DELIVER"));
//   startBlinkSequence(3, 800, 400);
// }

// void executeCollect(int count) {
//   currentState = STATE_COLLECTING;
//   strcpy(currentCommand, "COLLECT");
//   commandStartTime = millis();

//   Serial.print(F("ACK:COLLECT:"));
//   Serial.println(count);

//   startBlinkSequence(count, 600, 600);
// }

// void executeEstop() {
//   conveyorActive = false;
//   actionInProgress = false;
//   motorStop();
//   currentState = STATE_ESTOP;

//   Serial.println(F("ACK:ESTOP"));

//   for (int i = 0; i < 20; i++) {
//     digitalWrite(LED_PIN, HIGH); delay(50);
//     digitalWrite(LED_PIN, LOW);  delay(50);
//   }
//   digitalWrite(LED_PIN, HIGH);
// }

// void executeReset() {
//   conveyorActive = false;
//   actionInProgress = false;
//   motorStop();
//   servomotor.write(25);
//   currentState = STATE_IDLE;
//   digitalWrite(LED_PIN, LOW);

//   Serial.println(F("ACK:RESET"));
// }

// // ========== LED ENGINE ==========
// void startBlinkSequence(int count, int onMs, int offMs) {
//   blinksRemaining  = count;
//   blinkOnTime      = onMs;
//   blinkOffTime     = offMs;
//   blinkPhaseOn     = true;
//   actionInProgress = true;
//   lastBlinkTime    = millis();
//   digitalWrite(LED_PIN, HIGH);
// }

// void handleLedAnimation() {
//   if (!actionInProgress) return;
//   unsigned long now = millis();

//   if (blinkPhaseOn) {
//     if (now - lastBlinkTime >= (unsigned long)blinkOnTime) {
//       digitalWrite(LED_PIN, LOW);
//       blinkPhaseOn = false;
//       lastBlinkTime = now;
//     }
//   } else {
//     if (now - lastBlinkTime >= (unsigned long)blinkOffTime) {
//       if (blinksRemaining > 0) blinksRemaining--;

//       if (blinksRemaining == 0 && !conveyorActive) {
//         actionInProgress = false;
//         digitalWrite(LED_PIN, LOW);

//         Serial.print(F("DONE:"));
//         Serial.println(currentCommand);

//         currentState = STATE_IDLE;
//         return;
//       }

//       digitalWrite(LED_PIN, HIGH);
//       blinkPhaseOn = true;
//       lastBlinkTime = now;
//     }
//   }
// }

// // ========== SAFETY ==========
// void checkCommandTimeout() {
//   if (actionInProgress && currentState != STATE_CONVEYOR_RUNNING) {
//     if (millis() - commandStartTime > CMD_TIMEOUT_MS) {
//       actionInProgress = false;
//       conveyorActive = false;
//       motorStop();
//       digitalWrite(LED_PIN, LOW);
//       currentState = STATE_ERROR;
//       Serial.println(F("ERROR:TIMEOUT"));
//     }
//   }
// }

// void reportStatus() {
//   Serial.print(F("STATUS:"));
//   Serial.println((int)currentState);
// }



// /*
//  * AutoShop Robot Controller — HARDWARE INTEGRATED
//  * Shelf  : Servo on pin 9 (opens & closes once per PICK)
//  * Conveyor: DC motor via L298N (ENA=5, IN1=7, IN2=8) — runs on COLLECT
//  * LED    : Status indicator on LED_BUILTIN
//  */

// #include <Servo.h>

// // ========== PINS ==========
// #define LED_PIN       LED_BUILTIN
// #define SERVO_PIN     9

// #define ENA           5
// #define IN1           7
// #define IN2           8
// #define MOTOR_SPEED   150

// // ========== SHELF SERVO TIMING ==========
// #define SHELF_CLOSED_ANGLE   0
// #define SHELF_OPEN_ANGLE     90
// #define SHELF_OPEN_HOLD_MS   1500   // time the shelf stays open so the item drops
// #define SHELF_MOVE_MS        500    // time for the servo to physically move

// // ========== CONVEYOR TIMING ==========
// #define CONVEYOR_RUN_MS      5000   // how long conveyor runs on COLLECT before auto-stop

// // ========== SERIAL ==========
// #define SERIAL_BAUD       9600
// #define CMD_BUFFER_SIZE   64
// #define CMD_TIMEOUT_MS    30000

// enum RobotState {
//   STATE_IDLE,
//   STATE_PICKING,
//   STATE_PACKING,
//   STATE_CONVEYOR_RUNNING,
//   STATE_DELIVERING,
//   STATE_COLLECTING,
//   STATE_ESTOP,
//   STATE_ERROR
// };

// RobotState currentState = STATE_IDLE;

// Servo shelfServo;

// char cmdBuffer[CMD_BUFFER_SIZE];
// int  cmdIndex = 0;
// bool commandComplete = false;

// char currentCommand[16] = "";
// unsigned long commandStartTime = 0;

// // LED blink engine (kept for status feedback)
// unsigned long lastBlinkTime = 0;
// int  blinksRemaining = 0;
// int  blinkOnTime = 0;
// int  blinkOffTime = 0;
// bool blinkPhaseOn = true;
// bool actionInProgress = false;

// // Conveyor auto-stop
// bool conveyorActive = false;
// unsigned long conveyorStartTime = 0;
// unsigned long conveyorRunDuration = 0;   // 0 = run until CONVEYOR:STOP

// // ========== SETUP ==========
// void setup() {
//   Serial.begin(SERIAL_BAUD);

//   pinMode(LED_PIN, OUTPUT);
//   digitalWrite(LED_PIN, LOW);

//   // Conveyor motor pins
//   pinMode(IN1, OUTPUT);
//   pinMode(IN2, OUTPUT);
//   pinMode(ENA, OUTPUT);
//   conveyorStop();

//   // Shelf servo
//   shelfServo.attach(SERVO_PIN);
//   shelfServo.write(SHELF_CLOSED_ANGLE);

//   // Boot blink
//   for (int i = 0; i < 3; i++) {
//     digitalWrite(LED_PIN, HIGH); delay(120);
//     digitalWrite(LED_PIN, LOW);  delay(120);
//   }

//   Serial.println(F("LOG:READY"));
//   Serial.println(F("STATUS:IDLE"));
// }

// // ========== LOOP ==========
// void loop() {
//   readSerialInput();

//   if (commandComplete) {
//     processCommand();
//     commandComplete = false;
//     cmdIndex = 0;
//     memset(cmdBuffer, 0, CMD_BUFFER_SIZE);
//   }

//   handleLedAnimation();
//   handleConveyorTimer();
//   checkCommandTimeout();
// }

// // ========== SERIAL ==========
// void readSerialInput() {
//   while (Serial.available()) {
//     char c = Serial.read();
//     if (c == '\n' || c == '\r') {
//       if (cmdIndex > 0) {
//         cmdBuffer[cmdIndex] = '\0';
//         commandComplete = true;
//       }
//     } else if (cmdIndex < CMD_BUFFER_SIZE - 1) {
//       cmdBuffer[cmdIndex++] = c;
//     }
//   }
// }

// // ========== COMMAND PARSER ==========
// void processCommand() {
//   if (strcmp(cmdBuffer, "ESTOP") == 0) {
//     executeEstop();
//     return;
//   }

//   if (currentState == STATE_ESTOP) {
//     if (strcmp(cmdBuffer, "RESET") == 0) {
//       executeReset();
//     }
//     return;
//   }

//   char *mainCmd = strtok(cmdBuffer, ":");
//   char *param   = strtok(NULL, ":");

//   if (!mainCmd) return;

//   if (strcmp(mainCmd, "PICK") == 0) {
//     executePick(param ? atoi(param) : 1);
//   }
//   else if (strcmp(mainCmd, "PACK") == 0) {
//     executePack(param ? atoi(param) : 1);
//   }
//   else if (strcmp(mainCmd, "CONVEYOR") == 0) {
//     if (param && strcmp(param, "START") == 0) executeConveyorStart();
//     else if (param && strcmp(param, "STOP") == 0) executeConveyorStop();
//   }
//   else if (strcmp(mainCmd, "DELIVER") == 0) {
//     executeDeliver();
//   }
//   else if (strcmp(mainCmd, "COLLECT") == 0) {
//     executeCollect(param ? atoi(param) : 1);
//   }
//   else if (strcmp(mainCmd, "STATUS") == 0) {
//     reportStatus();
//   }
//   else if (strcmp(mainCmd, "RESET") == 0) {
//     executeReset();
//   }
//   else if (strcmp(mainCmd, "HEARTBEAT") == 0) {
//     Serial.println(F("ACK:HEARTBEAT"));
//   }
// }

// // ========== HARDWARE HELPERS ==========
// void shelfCycleOnce() {
//   // Open
//   shelfServo.write(SHELF_OPEN_ANGLE);
//   delay(SHELF_MOVE_MS);
//   // Hold open so the item drops onto the conveyor
//   delay(SHELF_OPEN_HOLD_MS);
//   // Close
//   shelfServo.write(SHELF_CLOSED_ANGLE);
//   delay(SHELF_MOVE_MS);
// }

// void conveyorForward() {
//   analogWrite(ENA, MOTOR_SPEED);
//   digitalWrite(IN1, HIGH);
//   digitalWrite(IN2, LOW);
// }

// void conveyorStop() {
//   analogWrite(ENA, 0);
//   digitalWrite(IN1, LOW);
//   digitalWrite(IN2, LOW);
// }

// // ========== ACTIONS ==========
// void executePick(int count) {
//   currentState = STATE_PICKING;
//   strcpy(currentCommand, "PICK");
//   commandStartTime = millis();

//   Serial.print(F("ACK:PICK:"));
//   Serial.println(count);

//   // Cycle the shelf `count` times (usually 1)
//   for (int i = 0; i < count; i++) {
//     shelfCycleOnce();
//   }

//   Serial.println(F("DONE:PICK"));
//   currentState = STATE_IDLE;

//   // brief LED feedback
//   startBlinkSequence(count, 150, 150);
// }

// void executePack(int count) {
//   currentState = STATE_PACKING;
//   strcpy(currentCommand, "PACK");
//   commandStartTime = millis();

//   Serial.print(F("ACK:PACK:"));
//   Serial.println(count);

//   startBlinkSequence(count, 300, 300);
// }

// void executeConveyorStart() {
//   currentState = STATE_CONVEYOR_RUNNING;
//   strcpy(currentCommand, "CONVEYOR");
//   commandStartTime = millis();

//   conveyorActive = true;
//   conveyorStartTime = millis();
//   conveyorRunDuration = 0;   // run until explicit STOP
//   conveyorForward();

//   Serial.println(F("ACK:CONVEYOR:START"));
//   startBlinkSequence(0, 500, 500); // infinite blink
// }

// void executeConveyorStop() {
//   conveyorActive = false;
//   actionInProgress = false;
//   conveyorStop();
//   digitalWrite(LED_PIN, LOW);
//   currentState = STATE_IDLE;

//   Serial.println(F("DONE:CONVEYOR"));
// }

// void executeDeliver() {
//   currentState = STATE_DELIVERING;
//   strcpy(currentCommand, "DELIVER");
//   commandStartTime = millis();

//   Serial.println(F("ACK:DELIVER"));
//   startBlinkSequence(3, 800, 400);
// }

// // COLLECT = customer asked to collect after paying → run conveyor for a fixed time
// void executeCollect(int count) {
//   currentState = STATE_COLLECTING;
//   strcpy(currentCommand, "COLLECT");
//   commandStartTime = millis();

//   Serial.print(F("ACK:COLLECT:"));
//   Serial.println(count);

//   conveyorActive = true;
//   conveyorStartTime = millis();
//   conveyorRunDuration = (unsigned long)CONVEYOR_RUN_MS * (count > 0 ? count : 1);
//   conveyorForward();

//   startBlinkSequence(0, 600, 600); // visual cue while running
// }

// void executeEstop() {
//   conveyorActive = false;
//   actionInProgress = false;
//   conveyorStop();
//   shelfServo.write(SHELF_CLOSED_ANGLE);
//   currentState = STATE_ESTOP;

//   Serial.println(F("ACK:ESTOP"));

//   for (int i = 0; i < 20; i++) {
//     digitalWrite(LED_PIN, HIGH); delay(50);
//     digitalWrite(LED_PIN, LOW);  delay(50);
//   }
//   digitalWrite(LED_PIN, HIGH);
// }

// void executeReset() {
//   conveyorActive = false;
//   actionInProgress = false;
//   conveyorStop();
//   shelfServo.write(SHELF_CLOSED_ANGLE);
//   currentState = STATE_IDLE;
//   digitalWrite(LED_PIN, LOW);

//   Serial.println(F("ACK:RESET"));
// }

// // ========== CONVEYOR AUTO-STOP TIMER ==========
// void handleConveyorTimer() {
//   if (!conveyorActive || conveyorRunDuration == 0) return;

//   if (millis() - conveyorStartTime >= conveyorRunDuration) {
//     conveyorActive = false;
//     actionInProgress = false;
//     conveyorStop();
//     digitalWrite(LED_PIN, LOW);

//     Serial.print(F("DONE:"));
//     Serial.println(currentCommand);

//     currentState = STATE_IDLE;
//   }
// }

// // ========== LED ENGINE ==========
// void startBlinkSequence(int count, int onMs, int offMs) {
//   blinksRemaining = count;
//   blinkOnTime = onMs;
//   blinkOffTime = offMs;
//   blinkPhaseOn = true;
//   actionInProgress = true;
//   lastBlinkTime = millis();
//   digitalWrite(LED_PIN, HIGH);
// }

// void handleLedAnimation() {
//   if (!actionInProgress) return;

//   unsigned long now = millis();

//   if (blinkPhaseOn) {
//     if (now - lastBlinkTime >= (unsigned long)blinkOnTime) {
//       digitalWrite(LED_PIN, LOW);
//       blinkPhaseOn = false;
//       lastBlinkTime = now;
//     }
//   } else {
//     if (now - lastBlinkTime >= (unsigned long)blinkOffTime) {
//       if (blinksRemaining > 0) blinksRemaining--;

//       if (blinksRemaining == 0 && !conveyorActive) {
//         actionInProgress = false;
//         digitalWrite(LED_PIN, LOW);

//         // Only emit DONE here if it wasn't already emitted (PICK & conveyor emit their own)
//         if (strcmp(currentCommand, "PICK") != 0 &&
//             strcmp(currentCommand, "COLLECT") != 0 &&
//             strcmp(currentCommand, "CONVEYOR") != 0) {
//           Serial.print(F("DONE:"));
//           Serial.println(currentCommand);
//           currentState = STATE_IDLE;
//         }
//         return;
//       }

//       digitalWrite(LED_PIN, HIGH);
//       blinkPhaseOn = true;
//       lastBlinkTime = now;
//     }
//   }
// }

// // ========== SAFETY ==========
// void checkCommandTimeout() {
//   if (actionInProgress &&
//       currentState != STATE_CONVEYOR_RUNNING &&
//       currentState != STATE_COLLECTING) {
//     if (millis() - commandStartTime > CMD_TIMEOUT_MS) {
//       actionInProgress = false;
//       conveyorActive = false;
//       conveyorStop();
//       digitalWrite(LED_PIN, LOW);
//       currentState = STATE_ERROR;

//       Serial.println(F("ERROR:TIMEOUT"));
//     }
//   }
// }

// void reportStatus() {
//   Serial.print(F("STATUS:"));
//   Serial.println((int)currentState);
// }




// started todsy 

// #include <Servo.h>

// /*
//  * AUTOSHOP HARDWARE CONTROLLER
//  * FINAL STABLE VERSION
//  */

// // ================= PINS =================
// #define LED_PIN LED_BUILTIN

// #define SERVO_PIN 9

// #define ENA 5
// #define IN1 7
// #define IN2 8

// // ================= SETTINGS =================
// #define MOTOR_SPEED 220

// Servo servomotor;

// // ================= SERIAL =================
// #define SERIAL_BAUD 9600
// #define CMD_BUFFER_SIZE 64

// char cmdBuffer[CMD_BUFFER_SIZE];
// int cmdIndex = 0;
// bool commandComplete = false;

// // ================= STATES =================
// bool conveyorRunning = false;

// // =====================================================
// // SETUP
// // =====================================================
// void setup() {

//   Serial.begin(SERIAL_BAUD);

//   pinMode(LED_PIN, OUTPUT);

//   pinMode(IN1, OUTPUT);
//   pinMode(IN2, OUTPUT);
//   pinMode(ENA, OUTPUT);

//   servomotor.attach(SERVO_PIN);

//   stopConveyor();

//   servomotor.write(25);

//   // boot blink
//   for(int i=0;i<3;i++){
//     digitalWrite(LED_PIN,HIGH);
//     delay(100);
//     digitalWrite(LED_PIN,LOW);
//     delay(100);
//   }

//   Serial.println("LOG:READY");
//   Serial.println("STATUS:IDLE");
// }

// // =====================================================
// // LOOP
// // =====================================================
// void loop() {

//   readSerial();

// }

// // =====================================================
// // SERIAL READER
// // =====================================================
// void readSerial() {

//   while (Serial.available()) {

//     char c = Serial.read();

//     if (c == '\n' || c == '\r') {

//       if (cmdIndex > 0) {

//         cmdBuffer[cmdIndex] = '\0';

//         commandComplete = true;

//       }

//     } else {

//       if (cmdIndex < CMD_BUFFER_SIZE - 1) {

//         cmdBuffer[cmdIndex++] = c;

//       }

//     }

//   }

//   if (commandComplete) {

//     processCommand();

//     commandComplete = false;

//     cmdIndex = 0;

//     memset(cmdBuffer, 0, CMD_BUFFER_SIZE);

//   }

// }

// // =====================================================
// // PROCESS COMMANDS
// // =====================================================
// void processCommand() {

//   char *mainCmd = strtok(cmdBuffer, ":");
//   char *param   = strtok(NULL, ":");

//   if (!mainCmd) return;

//   // ================= PICK =================
//   if (strcmp(mainCmd, "PICK") == 0) {

//     int count = param ? atoi(param) : 1;

//     Serial.print("ACK:PICK:");
//     Serial.println(count);

//     for(int i=0;i<count;i++){

//       shelf();

//     }

//     Serial.println("DONE:PICK");
//   }

//   // ================= COLLECT =================
//   else if (strcmp(mainCmd, "COLLECT") == 0) {

//     int count = param ? atoi(param) : 1;

//     Serial.print("ACK:COLLECT:");
//     Serial.println(count);

//     forward();

//     delay(5000 * count);

//     stopConveyor();

//     Serial.println("DONE:COLLECT");
//   }

//   // ================= CONVEYOR START =================
//   else if (strcmp(mainCmd, "CONVEYOR") == 0) {

//     if (param && strcmp(param, "START") == 0) {

//       Serial.println("ACK:CONVEYOR:START");

//       forward();

//       conveyorRunning = true;
//     }

//     else if (param && strcmp(param, "STOP") == 0) {

//       stopConveyor();

//       conveyorRunning = false;

//       Serial.println("DONE:CONVEYOR");
//     }

//   }

//   // ================= STATUS =================
//   else if (strcmp(mainCmd, "STATUS") == 0) {

//     Serial.println("STATUS:IDLE");

//   }

//   // ================= ESTOP =================
//   else if (strcmp(mainCmd, "ESTOP") == 0) {

//     stopConveyor();

//     servomotor.write(25);

//     Serial.println("ACK:ESTOP");

//   }

//   // ================= RESET =================
//   else if (strcmp(mainCmd, "RESET") == 0) {

//     stopConveyor();

//     servomotor.write(25);

//     Serial.println("ACK:RESET");

//   }

//   // ================= HEARTBEAT =================
//   else if (strcmp(mainCmd, "HEARTBEAT") == 0) {

//     Serial.println("ACK:HEARTBEAT");

//   }

// }

// // =====================================================
// // SERVO SHELF
// // =====================================================
// void shelf() {

//   // OPEN
//   for(int i=25; i<=170; i++){

//     servomotor.write(i);

//     delay(15);

//   }

//   delay(1000);

//   // CLOSE
//   for(int i=170; i>=25; i--){

//     servomotor.write(i);

//     delay(15);

//   }

//   delay(500);

// }

// // =====================================================
// // MOTOR FORWARD
// // =====================================================
// void forward() {

//   analogWrite(ENA, MOTOR_SPEED);

//   digitalWrite(IN1, HIGH);

//   digitalWrite(IN2, LOW);

//   digitalWrite(LED_PIN, HIGH);

// }

// // =====================================================
// // STOP MOTOR
// // =====================================================
// void stopConveyor() {

//   analogWrite(ENA, 0);

//   digitalWrite(IN1, LOW);

//   digitalWrite(IN2, LOW);

//   digitalWrite(LED_PIN, LOW);

// }






// #include <Servo.h>

// /*
// ====================================================
//  AUTOSHOP FINAL STABLE HARDWARE CODE
// ====================================================

// FIXES:
// - Prevents servo brownout spikes
// - Smooth servo motion
// - Stable serial communication
// - Proper DONE responses
// - Conveyor support
// - ESTOP support
// - RESET support

// IMPORTANT HARDWARE:
// - Servo MUST use external 5V supply
// - Motor MUST use external supply
// - ALL GROUNDS CONNECTED TOGETHER

// ====================================================
// */

// // ================= PINS =================
// #define LED_PIN  LED_BUILTIN

// #define SERVO_PIN 9

// #define ENA 5
// #define IN1 7
// #define IN2 8

// // ================= SETTINGS =================
// #define MOTOR_SPEED 180

// // safer servo range
// #define SERVO_CLOSED 25
// #define SERVO_OPEN   90

// // smoother movement
// #define SERVO_DELAY 30

// Servo servomotor;

// // ================= SERIAL =================
// #define SERIAL_BAUD 9600
// #define CMD_BUFFER_SIZE 64

// char cmdBuffer[CMD_BUFFER_SIZE];
// int cmdIndex = 0;
// bool commandComplete = false;

// // ================= STATUS =================
// bool conveyorRunning = false;

// // =====================================================
// // SETUP
// // =====================================================
// void setup() {

//   Serial.begin(SERIAL_BAUD);

//   pinMode(LED_PIN, OUTPUT);

//   pinMode(IN1, OUTPUT);
//   pinMode(IN2, OUTPUT);
//   pinMode(ENA, OUTPUT);

//   // stop motor
//   stopConveyor();

//   // attach servo
//   servomotor.attach(SERVO_PIN);

//   // move servo slowly to safe start position
//   servomotor.write(SERVO_CLOSED);

//   delay(1000);

//   // boot blink
//   for (int i = 0; i < 3; i++) {

//     digitalWrite(LED_PIN, HIGH);
//     delay(150);

//     digitalWrite(LED_PIN, LOW);
//     delay(150);
//   }

//   Serial.println("READY");
//   Serial.println("STATUS:IDLE");
// }

// // =====================================================
// // MAIN LOOP
// // =====================================================
// void loop() {

//   readSerial();

// }

// // =====================================================
// // SERIAL HANDLER
// // =====================================================
// void readSerial() {

//   while (Serial.available()) {

//     char c = Serial.read();

//     if (c == '\n' || c == '\r') {

//       if (cmdIndex > 0) {

//         cmdBuffer[cmdIndex] = '\0';

//         commandComplete = true;
//       }

//     } else {

//       if (cmdIndex < CMD_BUFFER_SIZE - 1) {

//         cmdBuffer[cmdIndex++] = c;
//       }
//     }
//   }

//   if (commandComplete) {

//     processCommand();

//     commandComplete = false;

//     cmdIndex = 0;

//     memset(cmdBuffer, 0, CMD_BUFFER_SIZE);
//   }
// }

// // =====================================================
// // COMMAND PROCESSOR
// // =====================================================
// void processCommand() {

//   char *mainCmd = strtok(cmdBuffer, ":");
//   char *param = strtok(NULL, ":");

//   if (!mainCmd) return;

//   // ================= PICK =================
//   if (strcmp(mainCmd, "PICK") == 0) {

//     int count = param ? atoi(param) : 1;

//     Serial.print("ACK:PICK:");
//     Serial.println(count);

//     for (int i = 0; i < count; i++) {

//       shelfCycle();
//     }

//     Serial.println("DONE:PICK");
//   }

//   // ================= COLLECT =================
//   else if (strcmp(mainCmd, "COLLECT") == 0) {

//     int count = param ? atoi(param) : 1;

//     Serial.print("ACK:COLLECT:");
//     Serial.println(count);

//     conveyorForward();

//     delay(5000 * count);

//     stopConveyor();

//     Serial.println("DONE:COLLECT");
//   }

//   // ================= CONVEYOR =================
//   else if (strcmp(mainCmd, "CONVEYOR") == 0) {

//     if (param && strcmp(param, "START") == 0) {

//       conveyorForward();

//       conveyorRunning = true;

//       Serial.println("ACK:CONVEYOR:START");
//     }

//     else if (param && strcmp(param, "STOP") == 0) {

//       stopConveyor();

//       conveyorRunning = false;

//       Serial.println("DONE:CONVEYOR");
//     }
//   }

//   // ================= PACK =================
//   else if (strcmp(mainCmd, "PACK") == 0) {

//     int count = param ? atoi(param) : 1;

//     Serial.print("ACK:PACK:");
//     Serial.println(count);

//     blinkLed(count, 300);

//     Serial.println("DONE:PACK");
//   }

//   // ================= DELIVER =================
//   else if (strcmp(mainCmd, "DELIVER") == 0) {

//     Serial.println("ACK:DELIVER");

//     blinkLed(3, 500);

//     Serial.println("DONE:DELIVER");
//   }

//   // ================= STATUS =================
//   else if (strcmp(mainCmd, "STATUS") == 0) {

//     Serial.println("STATUS:IDLE");
//   }

//   // ================= ESTOP =================
//   else if (strcmp(mainCmd, "ESTOP") == 0) {

//     stopConveyor();

//     servomotor.write(SERVO_CLOSED);

//     digitalWrite(LED_PIN, LOW);

//     Serial.println("ACK:ESTOP");
//   }

//   // ================= RESET =================
//   else if (strcmp(mainCmd, "RESET") == 0) {

//     stopConveyor();

//     servomotor.write(SERVO_CLOSED);

//     digitalWrite(LED_PIN, LOW);

//     Serial.println("ACK:RESET");
//   }

//   // ================= HEARTBEAT =================
//   else if (strcmp(mainCmd, "HEARTBEAT") == 0) {

//     Serial.println("ACK:HEARTBEAT");
//   }

//   // ================= UNKNOWN =================
//   else {

//     Serial.println("ERROR:UNKNOWN_COMMAND");
//   }
// }

// // =====================================================
// // SHELF MOVEMENT
// // =====================================================
// void shelfCycle() {

//   // OPEN SLOWLY
//   for (int pos = SERVO_CLOSED; pos <= SERVO_OPEN; pos++) {

//     servomotor.write(pos);

//     delay(SERVO_DELAY);
//   }

//   delay(1000);

//   // CLOSE SLOWLY
//   for (int pos = SERVO_OPEN; pos >= SERVO_CLOSED; pos--) {

//     servomotor.write(pos);

//     delay(SERVO_DELAY);
//   }

//   delay(500);
// }

// // =====================================================
// // MOTOR FORWARD
// // =====================================================
// void conveyorForward() {

//   analogWrite(ENA, MOTOR_SPEED);

//   digitalWrite(IN1, HIGH);

//   digitalWrite(IN2, LOW);

//   digitalWrite(LED_PIN, HIGH);
// }

// // =====================================================
// // STOP MOTOR
// // =====================================================
// void stopConveyor() {

//   analogWrite(ENA, 0);

//   digitalWrite(IN1, LOW);

//   digitalWrite(IN2, LOW);

//   digitalWrite(LED_PIN, LOW);
// }

// // =====================================================
// // LED BLINK
// // =====================================================
// void blinkLed(int times, int speedMs) {

//   for (int i = 0; i < times; i++) {

//     digitalWrite(LED_PIN, HIGH);

//     delay(speedMs);

//     digitalWrite(LED_PIN, LOW);

//     delay(speedMs);
//   }
// }





















// close 
// #include <Servo.h>

// Servo servomotor;

// // ================= MOTOR =================
// #define ENA 5
// #define IN1 7
// #define IN2 8

// #define motorSpeed 220

// String command = "";

// // =================================================
// // FORWARD
// // =================================================
// void forward() {

//   analogWrite(ENA, motorSpeed);

//   digitalWrite(IN1, HIGH);
//   digitalWrite(IN2, LOW);

//   Serial.println("Motor Forward");
// }

// // =================================================
// // BACKWARD
// // =================================================
// void backward() {

//   analogWrite(ENA, motorSpeed);

//   digitalWrite(IN1, LOW);
//   digitalWrite(IN2, HIGH);

//   Serial.println("Motor Backward");
// }

// // =================================================
// // STOP
// // =================================================
// void stopMotor() {

//   analogWrite(ENA, 0);

//   digitalWrite(IN1, LOW);
//   digitalWrite(IN2, LOW);

//   Serial.println("Motor Stop");
// }

// // =================================================
// // SHELF
// // =================================================
// void shelf() {

//   for (int i = 25; i <= 170; i++) {
//     servomotor.write(i);
//     delay(25);
//   }

//   delay(1000);

//   for (int i = 170; i >= 25; i--) {
//     servomotor.write(i);
//     delay(25);
//   }

//   delay(3000);

//   Serial.println("shelf open to pick object and closed onced done");
// }

// // =================================================
// // SETUP
// // =================================================
// void setup() {

//   Serial.begin(9600);

//   servomotor.attach(9);

//   pinMode(IN1, OUTPUT);
//   pinMode(IN2, OUTPUT);
//   pinMode(ENA, OUTPUT);

//   stopMotor();

//   Serial.println("READY");
// }

// // =================================================
// // LOOP
// // =================================================
// void loop() {

//   if (Serial.available() > 0) {

//     command = Serial.readStringUntil('\n');
//     command.trim();

//     Serial.print("COMMAND:");
//     Serial.println(command);

//     // ================= PICK =================
//     if (command == "PICK") {

//       Serial.println("ACK:PICK");

//       shelf();

//       Serial.println("DONE:PICK");
//     }

//     // ================= COLLECT =================
//     else if (command == "COLLECT") {

//       Serial.println("ACK:COLLECT");

//       forward();
//       delay(10000);
//       stopMotor();

//       Serial.println("DONE:COLLECT");
//     }

//     // ================= CONVEYOR =================
//     else if (command == "CONVEYOR:START") {

//       Serial.println("ACK:CONVEYOR");
//       forward();
//     }

//     else if (command == "CONVEYOR:STOP") {

//       stopMotor();
//       Serial.println("DONE:CONVEYOR");
//     }

//     // ================= PACK =================
//     else if (command == "PACK") {

//       Serial.println("ACK:PACK");
//       delay(1000);
//       Serial.println("DONE:PACK");
//     }

//     // ================= DELIVER =================
//     else if (command == "DELIVER") {

//       Serial.println("ACK:DELIVER");
//       delay(1000);
//       Serial.println("DONE:DELIVER");
//     }

//     // ================= STATUS =================
//     else if (command == "STATUS") {

//       Serial.println("STATUS:IDLE");
//     }

//     // ================= HEARTBEAT =================
//     else if (command == "HEARTBEAT") {

//       Serial.println("ACK:HEARTBEAT");
//     }

//     // ================= RESET =================
//     else if (command == "RESET") {

//       stopMotor();
//       Serial.println("ACK:RESET");
//     }

//     // ================= ESTOP =================
//     else if (command == "ESTOP") {

//       stopMotor();
//       Serial.println("ACK:ESTOP");
//     }
//   }
// }


// almost 
// #include <Servo.h>

// Servo servomotor;

// // ================= MOTOR =================
// #define ENA 5
// #define IN1 7
// #define IN2 8
// #define motorSpeed 220

// String command = "";

// // ================= MOTOR FUNCTIONS =================
// void forward() {
//   analogWrite(ENA, motorSpeed);
//   digitalWrite(IN1, HIGH);
//   digitalWrite(IN2, LOW);
// }

// void backward() {
//   analogWrite(ENA, motorSpeed);
//   digitalWrite(IN1, LOW);
//   digitalWrite(IN2, HIGH);
// }

// void stopMotor() {
//   analogWrite(ENA, 0);
//   digitalWrite(IN1, LOW);
//   digitalWrite(IN2, LOW);
// }

// // ================= SHELF (PICK MECHANISM) =================
// void shelf() {
//   for (int i = 25; i <= 170; i++) {
//     servomotor.write(i);
//     delay(20);
//   }

//   delay(800);

//   for (int i = 170; i >= 25; i--) {
//     servomotor.write(i);
//     delay(20);
//   }

//   delay(500);
// }

// // ================= SETUP =================
// void setup() {
//   Serial.begin(9600);

//   servomotor.attach(9);

//   pinMode(IN1, OUTPUT);
//   pinMode(IN2, OUTPUT);
//   pinMode(ENA, OUTPUT);

//   stopMotor();

//   Serial.println("READY");
// }

// // ================= LOOP =================
// void loop() {

//   if (Serial.available() > 0) {

//     command = Serial.readStringUntil('\n');
//     command.trim();

//     // ================= HEARTBEAT =================
//     if (command == "HEARTBEAT") {
//       Serial.println("ACK:HEARTBEAT");
//       return;
//     }

//     // ================= PICK =================
//     if (command.startsWith("PICK")) {

//       Serial.println("ACK:PICK");

//       shelf();

//       Serial.println("DONE:PICK");
//       Serial.flush();
//       return;
//     }

//     // ================= PACK =================
//     if (command == "PACK") {

//       Serial.println("ACK:PACK");
//       delay(500);
//       Serial.println("DONE:PACK");
//       Serial.flush();
//       return;
//     }

//     // ================= CONVEYOR =================
//     if (command == "CONVEYOR:START") {

//       Serial.println("ACK:CONVEYOR");

//       forward();
//       return;
//     }

//     if (command == "CONVEYOR:STOP") {

//       stopMotor();

//       Serial.println("DONE:CONVEYOR");
//       return;
//     }

//     // ================= COLLECT =================
//     if (command == "COLLECT") {

//       Serial.println("ACK:COLLECT");

//       forward();
//       delay(3000);
//       stopMotor();

//       Serial.println("DONE:COLLECT");
//       return;
//     }

//     // ================= DEFAULT =================
//     Serial.println("ACK:UNKNOWN");
//   }
// }












// #include <Servo.h>

// Servo servomotor;

// // ================= MOTOR =================
// #define ENA 5
// #define IN1 7
// #define IN2 8

// #define motorSpeed 220

// String command = "";

// // =================================================
// // FORWARD
// // =================================================
// void forward() {

//   analogWrite(ENA, motorSpeed);

//   digitalWrite(IN1, HIGH);
//   digitalWrite(IN2, LOW);
// }

// // =================================================
// // BACKWARD
// // =================================================
// void backward() {

//   analogWrite(ENA, motorSpeed);

//   digitalWrite(IN1, LOW);
//   digitalWrite(IN2, HIGH);
// }

// // =================================================
// // STOP
// // =================================================
// void stopMotor() {

//   analogWrite(ENA, 0);

//   digitalWrite(IN1, LOW);
//   digitalWrite(IN2, LOW);
// }

// // =================================================
// // SHELF
// // =================================================
// void shelf() {

//   // OPEN
//   servomotor.write(170);
//   delay(1200);

//   // CLOSE
//   servomotor.write(25);
//   delay(1200);
// }

// // =================================================
// // SETUP
// // =================================================
// void setup() {

//   Serial.begin(9600);

//   servomotor.attach(9);

//   pinMode(IN1, OUTPUT);
//   pinMode(IN2, OUTPUT);
//   pinMode(ENA, OUTPUT);

//   stopMotor();

//   servomotor.write(25);

//   delay(1000);

//   Serial.println("READY");
// }

// // =================================================
// // LOOP
// // =================================================
// void loop() {

//   if (Serial.available() > 0) {

//     command = Serial.readStringUntil('\n');

//     command.trim();

//     // =================================================
//     // PICK
//     // =================================================
//     if (command.startsWith("PICK")) {

//       Serial.println("ACK:PICK");
//       Serial.flush();

//       shelf();

//       delay(200);

//       Serial.println("DONE:PICK");
//       Serial.flush();
//     }

//     // =================================================
//     // PACK
//     // =================================================
//     else if (command.startsWith("PACK")) {

//       Serial.println("ACK:PACK");
//       Serial.flush();

//       delay(1000);

//       Serial.println("DONE:PACK");
//       Serial.flush();
//     }

//     // =================================================
//     // CONVEYOR START
//     // =================================================
//     else if (command == "CONVEYOR:START") {

//       Serial.println("ACK:CONVEYOR");
//       Serial.flush();

//       forward();
//     }

//     // =================================================
//     // CONVEYOR STOP
//     // =================================================
//     else if (command == "CONVEYOR:STOP") {

//       stopMotor();

//       Serial.println("DONE:CONVEYOR");
//       Serial.flush();
//     }

//     // =================================================
//     // COLLECT
//     // =================================================
//     else if (command.startsWith("COLLECT")) {

//       Serial.println("ACK:COLLECT");
//       Serial.flush();

//       forward();

//       delay(3000);

//       stopMotor();

//       Serial.println("DONE:COLLECT");
//       Serial.flush();
//     }

//     // =================================================
//     // DELIVER
//     // =================================================
//     else if (command.startsWith("DELIVER")) {

//       Serial.println("ACK:DELIVER");
//       Serial.flush();

//       delay(1000);

//       Serial.println("DONE:DELIVER");
//       Serial.flush();
//     }

//     // =================================================
//     // STATUS
//     // =================================================
//     else if (command == "STATUS") {

//       Serial.println("STATUS:IDLE");
//       Serial.flush();
//     }

//     // =================================================
//     // HEARTBEAT
//     // =================================================
//     else if (command == "HEARTBEAT") {

//       Serial.println("ACK:HEARTBEAT");
//       Serial.flush();
//     }

//     // =================================================
//     // RESET
//     // =================================================
//     else if (command == "RESET") {

//       stopMotor();

//       Serial.println("ACK:RESET");
//       Serial.flush();
//     }

//     // =================================================
//     // ESTOP
//     // =================================================
//     else if (command == "ESTOP") {

//       stopMotor();

//       Serial.println("ACK:ESTOP");
//       Serial.flush();
//     }

//     // =================================================
//     // UNKNOWN
//     // =================================================
//     else {

//       Serial.println("ERROR:UNKNOWN_COMMAND");
//       Serial.flush();
//     }
//   }
// }











// #include <Servo.h>

// Servo servomotor;

// void setup() {

//   Serial.begin(9600);

//   servomotor.attach(9);

//   Serial.println("READY");
// }

// void loop() {

//   if (Serial.available()) {

//     String cmd = Serial.readStringUntil('\n');

//     cmd.trim();

//     Serial.print("RECEIVED:");
//     Serial.println(cmd);

//     if (cmd.startsWith("PICK")) {

//       Serial.println("ACK:PICK");

//       servomotor.write(170);
//       delay(1000);

//       servomotor.write(25);
//       delay(1000);

//       Serial.println("DONE:PICK");
//     }
//   }
// }

















// // super so far works 97%
// #include <Servo.h>

// Servo servomotor;

// // ================= MOTOR =================
// #define ENA 5
// #define IN1 7
// #define IN2 8

// #define motorSpeed 220

// String command = "";

// // =================================================
// // FORWARD
// // =================================================
// void forward() {

//   analogWrite(ENA, motorSpeed);

//   digitalWrite(IN1, HIGH);
//   digitalWrite(IN2, LOW);
// }

// // =================================================
// // BACKWARD
// // =================================================
// void backward() {

//   analogWrite(ENA, motorSpeed);

//   digitalWrite(IN1, LOW);
//   digitalWrite(IN2, HIGH);
// }

// // =================================================
// // STOP
// // =================================================
// void stopMotor() {

//   analogWrite(ENA, 0);

//   digitalWrite(IN1, LOW);
//   digitalWrite(IN2, LOW);
// }

// // =================================================
// // SHELF
// // =================================================
// void shelf() {

//   // OPEN
//   servomotor.write(170);
//   delay(1200);

//   // CLOSE
//   servomotor.write(25);
//   delay(1200);
// }

// // =================================================
// // GET ITEM COUNT FROM COMMAND
// // Example:
// // PICK:3  -> returns 3
// // PACK:5  -> returns 5
// // =================================================
// int getItemCount(String cmd) {

//   int separator = cmd.indexOf(':');

//   // Default = 1
//   if (separator == -1) {
//     return 1;
//   }

//   String countText = cmd.substring(separator + 1);

//   int count = countText.toInt();

//   // Prevent invalid values
//   if (count <= 0) {
//     count = 1;
//   }

//   return count;
// }

// // =================================================
// // SETUP
// // =================================================
// void setup() {

//   Serial.begin(9600);

//   servomotor.attach(9);

//   pinMode(IN1, OUTPUT);
//   pinMode(IN2, OUTPUT);
//   pinMode(ENA, OUTPUT);

//   stopMotor();

//   servomotor.write(25);

//   delay(1000);

//   Serial.println("READY");
// }

// // =================================================
// // LOOP
// // =================================================
// void loop() {

//   if (Serial.available() > 0) {

//     command = Serial.readStringUntil('\n');

//     command.trim();

//     Serial.print("COMMAND:");
//     Serial.println(command);

//     // =================================================
//     // PICK
//     // =================================================
//     if (command.startsWith("PICK")) {

//       Serial.println("ACK:PICK");
//       Serial.flush();

//       int itemCount = getItemCount(command);

//       Serial.print("PICKING ITEMS:");
//       Serial.println(itemCount);

//       for (int i = 0; i < itemCount; i++) {

//         shelf();

//         delay(300);
//       }

//       Serial.println("DONE:PICK");
//       Serial.flush();
//     }

//     // =================================================
//     // PACK
//     // =================================================
//     else if (command.startsWith("PACK")) {

//       Serial.println("ACK:PACK");
//       Serial.flush();

//       int itemCount = getItemCount(command);

//       Serial.print("PACKING ITEMS:");
//       Serial.println(itemCount);

//       delay(itemCount * 1000);

//       Serial.println("DONE:PACK");
//       Serial.flush();
//     }

//     // =================================================
//     // CONVEYOR START
//     // =================================================
//     else if (command == "CONVEYOR:START") {

//       Serial.println("ACK:CONVEYOR");
//       Serial.flush();

//       forward();
//     }

//     // =================================================
//     // CONVEYOR STOP
//     // =================================================
//     else if (command == "CONVEYOR:STOP") {

//       stopMotor();

//       Serial.println("DONE:CONVEYOR");
//       Serial.flush();
//     }

//     // =================================================
//     // COLLECT
//     // =================================================
//     else if (command.startsWith("COLLECT")) {

//       Serial.println("ACK:COLLECT");
//       Serial.flush();

//       int itemCount = getItemCount(command);

//       Serial.print("COLLECTING ITEMS:");
//       Serial.println(itemCount);

//       forward();

//       delay(itemCount * 3000);

//       stopMotor();

//       Serial.println("DONE:COLLECT");
//       Serial.flush();
//     }

//     // =================================================
//     // DELIVER
//     // =================================================
//     else if (command.startsWith("DELIVER")) {

//       Serial.println("ACK:DELIVER");
//       Serial.flush();

//       delay(1000);

//       Serial.println("DONE:DELIVER");
//       Serial.flush();
//     }

//     // =================================================
//     // STATUS
//     // =================================================
//     else if (command == "STATUS") {

//       Serial.println("STATUS:IDLE");
//       Serial.flush();
//     }

//     // =================================================
//     // HEARTBEAT
//     // =================================================
//     else if (command == "HEARTBEAT") {

//       Serial.println("ACK:HEARTBEAT");
//       Serial.flush();
//     }

//     // =================================================
//     // RESET
//     // =================================================
//     else if (command == "RESET") {

//       stopMotor();

//       Serial.println("ACK:RESET");
//       Serial.flush();
//     }

//     // =================================================
//     // ESTOP
//     // =================================================
//     else if (command == "ESTOP") {

//       stopMotor();

//       Serial.println("ACK:ESTOP");
//       Serial.flush();
//     }

//     // =================================================
//     // UNKNOWN
//     // =================================================
//     else {

//       Serial.println("ERROR:UNKNOWN_COMMAND");
//       Serial.flush();
//     }
//   }
// }










// // super so far works 98%
// #include <Servo.h>

// Servo servomotor;

// // ================= MOTOR =================
// #define ENA 5
// #define IN1 7
// #define IN2 8

// #define motorSpeed 220

// String command = "";

// // =================================================
// // FORWARD
// // =================================================
// void forward() {

//   analogWrite(ENA, motorSpeed);

//   digitalWrite(IN1, HIGH);
//   digitalWrite(IN2, LOW);
// }

// // =================================================
// // BACKWARD
// // =================================================
// void backward() {

//   analogWrite(ENA, motorSpeed);

//   digitalWrite(IN1, LOW);
//   digitalWrite(IN2, HIGH);
// }

// // =================================================
// // STOP
// // =================================================
// void stopMotor() {

//   analogWrite(ENA, 0);

//   digitalWrite(IN1, LOW);
//   digitalWrite(IN2, LOW);
// }

// // =================================================
// // SHELF
// // =================================================
// void shelf() {

//   // OPEN SLOWLY
//   for (int pos = 25; pos <= 170; pos++) {

//     servomotor.write(pos);

//     delay(15);
//   }

//   delay(1000);

//   // CLOSE SLOWLY
//   for (int pos = 170; pos >= 25; pos--) {

//     servomotor.write(pos);

//     delay(15);
//   }

//   delay(500);
// }

// // =================================================
// // GET ITEM COUNT FROM COMMAND
// // Example:
// // PICK:3  -> returns 3
// // PACK:5  -> returns 5
// // =================================================
// int getItemCount(String cmd) {

//   int separator = cmd.indexOf(':');

//   // Default = 1
//   if (separator == -1) {
//     return 1;
//   }

//   String countText = cmd.substring(separator + 1);

//   int count = countText.toInt();

//   // Prevent invalid values
//   if (count <= 0) {
//     count = 1;
//   }

//   return count;
// }

// // =================================================
// // SETUP
// // =================================================
// void setup() {

//   Serial.begin(9600);

//   servomotor.attach(9);

//   pinMode(IN1, OUTPUT);
//   pinMode(IN2, OUTPUT);
//   pinMode(ENA, OUTPUT);

//   stopMotor();

//   servomotor.write(25);

//   delay(1000);

//   Serial.println("READY");
// }

// // =================================================
// // LOOP
// // =================================================
// void loop() {

//   if (Serial.available() > 0) {

//     command = Serial.readStringUntil('\n');

//     command.trim();

//     Serial.print("COMMAND:");
//     Serial.println(command);

//     // =================================================
//     // PICK
//     // =================================================
//     if (command.startsWith("PICK")) {

//       Serial.println("ACK:PICK");
//       Serial.flush();

//       int itemCount = getItemCount(command);

//       Serial.print("PICKING ITEMS:");
//       Serial.println(itemCount);

//       for (int i = 0; i < itemCount; i++) {

//         shelf();

//         delay(300);
//       }

//       Serial.println("DONE:PICK");
//       Serial.flush();
//     }

//     // =================================================
//     // PACK
//     // =================================================
//     else if (command.startsWith("PACK")) {

//       Serial.println("ACK:PACK");
//       Serial.flush();

//       int itemCount = getItemCount(command);

//       Serial.print("PACKING ITEMS:");
//       Serial.println(itemCount);

//       delay(itemCount * 1000);

//       Serial.println("DONE:PACK");
//       Serial.flush();
//     }

//     // =================================================
//     // CONVEYOR START
//     // =================================================
//     else if (command == "CONVEYOR:START") {

//       Serial.println("ACK:CONVEYOR");
//       Serial.flush();

//       forward();
//     }

//     // =================================================
//     // CONVEYOR STOP
//     // =================================================
//     else if (command == "CONVEYOR:STOP") {

//       stopMotor();

//       Serial.println("DONE:CONVEYOR");
//       Serial.flush();
//     }

//     // =================================================
//     // COLLECT
//     // =================================================
//     else if (command.startsWith("COLLECT")) {

//       Serial.println("ACK:COLLECT");
//       Serial.flush();

//       int itemCount = getItemCount(command);

//       Serial.print("COLLECTING ITEMS:");
//       Serial.println(itemCount);

//       forward();

//       delay(itemCount * 3000);

//       stopMotor();

//       Serial.println("DONE:COLLECT");
//       Serial.flush();
//     }

//     // =================================================
//     // DELIVER
//     // =================================================
//     else if (command.startsWith("DELIVER")) {

//       Serial.println("ACK:DELIVER");
//       Serial.flush();

//       delay(1000);

//       Serial.println("DONE:DELIVER");
//       Serial.flush();
//     }

//     // =================================================
//     // STATUS
//     // =================================================
//     else if (command == "STATUS") {

//       Serial.println("STATUS:IDLE");
//       Serial.flush();
//     }

//     // =================================================
//     // HEARTBEAT
//     // =================================================
//     else if (command == "HEARTBEAT") {

//       Serial.println("ACK:HEARTBEAT");
//       Serial.flush();
//     }

//     // =================================================
//     // RESET
//     // =================================================
//     else if (command == "RESET") {

//       stopMotor();

//       Serial.println("ACK:RESET");
//       Serial.flush();
//     }

//     // =================================================
//     // ESTOP
//     // =================================================
//     else if (command == "ESTOP") {

//       stopMotor();

//       Serial.println("ACK:ESTOP");
//       Serial.flush();
//     }

//     // =================================================
//     // UNKNOWN
//     // =================================================
//     else {

//       Serial.println("ERROR:UNKNOWN_COMMAND");
//       Serial.flush();
//     }
//   }
// }










// works 100% for one item like super good
#include <Servo.h>

Servo servomotor;

// ================= MOTOR =================
#define ENA 5
#define IN1 7
#define IN2 8

#define motorSpeed 220

String command = "";

// ================= SERIAL BUFFER FIX =================
char cmdBuffer[32];
byte idx = 0;

// =================================================
// FORWARD
// =================================================
void forward() {

  analogWrite(ENA, motorSpeed);

  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
}

// =================================================
// BACKWARD
// =================================================
void backward() {

  analogWrite(ENA, motorSpeed);

  digitalWrite(IN1, LOW);
  digitalWrite(IN2, HIGH);
}

// =================================================
// STOP
// =================================================
void stopMotor() {

  analogWrite(ENA, 0);

  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
}

// =================================================
// SHELF
// =================================================
void shelf() {

  // OPEN SLOWLY
  for (int pos = 25; pos <= 170; pos++) {

    servomotor.write(pos);

    delay(15);
  }

  delay(1000);

  // CLOSE SLOWLY
  for (int pos = 170; pos >= 25; pos--) {

    servomotor.write(pos);

    delay(15);
  }

  delay(500);
}

// =================================================
// GET ITEM COUNT FROM COMMAND
// =================================================
int getItemCount(String cmd) {

  int separator = cmd.indexOf(':');

  if (separator == -1) {
    return 1;
  }

  const char* text = cmd.c_str();

  int count = atoi(text + separator + 1);

  if (count <= 0) {
    count = 1;
  }

  return count;
}

// =================================================
// SETUP
// =================================================
void setup() {

  Serial.begin(9600);

  servomotor.attach(9);

  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(ENA, OUTPUT);

  stopMotor();

  servomotor.write(25);

  delay(1000);

  Serial.println("READY");
}

// =================================================
// LOOP (FIXED SERIAL HANDLING ONLY)
// =================================================
void loop() {

  while (Serial.available() > 0) {

    char c = Serial.read();

    if (c == '\n') {

      cmdBuffer[idx] = '\0';
      command = String(cmdBuffer);
      idx = 0;

      command.trim();
      command.replace("\r", "");

      Serial.print("COMMAND:");
      Serial.println(command);
      Serial.flush();

      // =================================================
      // PICK
      // =================================================
      if (command.startsWith("PICK")) {

        Serial.println("ACK:PICK");
        Serial.flush();

        int itemCount = getItemCount(command);

        for (int i = 0; i < itemCount; i++) {

          shelf();

          delay(300);
        }

        Serial.println("DONE:PICK");
        Serial.flush();
      }

      // =================================================
      // PACK
      // =================================================
      else if (command.startsWith("PACK")) {

        Serial.println("ACK:PACK");
        Serial.flush();

        int itemCount = getItemCount(command);

        delay(itemCount * 1000);

        Serial.println("DONE:PACK");
        Serial.flush();
      }

      // =================================================
      // CONVEYOR START
      // =================================================
      else if (command == "CONVEYOR:START") {

        Serial.println("ACK:CONVEYOR");
        Serial.flush();

        forward();
      }

      // =================================================
      // CONVEYOR STOP
      // =================================================
      else if (command == "CONVEYOR:STOP") {

        stopMotor();

        Serial.println("DONE:CONVEYOR");
        Serial.flush();
      }

      // =================================================
      // COLLECT
      // =================================================
      else if (command.startsWith("COLLECT")) {

        Serial.println("ACK:COLLECT");
        Serial.flush();

        int itemCount = getItemCount(command);

        forward();

        delay(itemCount * 3000);

        stopMotor();

        Serial.println("DONE:COLLECT");
        Serial.flush();
      }

      // =================================================
      // DELIVER
      // =================================================
      else if (command.startsWith("DELIVER")) {

        Serial.println("ACK:DELIVER");
        Serial.flush();

        delay(1000);

        Serial.println("DONE:DELIVER");
        Serial.flush();
      }

      else if (command == "STATUS") {

        Serial.println("STATUS:IDLE");
        Serial.flush();
      }

      else if (command == "HEARTBEAT") {

        Serial.println("ACK:HEARTBEAT");
        Serial.flush();
      }

      else if (command == "RESET") {

        stopMotor();

        Serial.println("ACK:RESET");
        Serial.flush();
      }

      else if (command == "ESTOP") {

        stopMotor();

        Serial.println("ACK:ESTOP");
        Serial.flush();
      }

      else {

        Serial.println("ERROR:UNKNOWN_COMMAND");
        Serial.flush();
      }

    } else {

      if (idx < sizeof(cmdBuffer) - 1) {
        cmdBuffer[idx++] = c;
      } else {
        idx = 0;
      }
    }
  }
}