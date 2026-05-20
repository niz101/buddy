#!/usr/bin/env node
/**
 * AutoShop Serial Bridge Server v2.3
 */

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { WebSocketServer } = require('ws');

// ========== CONFIGURATION ==========
const SERIAL_PATH = process.argv[2] || '/dev/ttyACM0';
const SERIAL_BAUD = parseInt(process.argv[3]) || 9600;

const WS_PORT = 8765;
const RECONNECT_INTERVAL = 3000;

const COMMAND_TIMEOUT_MS = 30000;
const MIN_COMMAND_GAP_MS = 200;

// ========== STATE ==========
let serialPort = null;
let parser = null;

let wsClients = new Set();

let isConnected = false;
let simulationMode = false;

let commandQueue = [];
let processingQueue = false;

let pendingResolver = null;
let pendingCommand = null;
let pendingTimer = null;

// ========== SERIAL CONNECTION ==========
function connectSerial() {

  console.log(`[SERIAL] Connecting to ${SERIAL_PATH} at ${SERIAL_BAUD} baud...`);

  try {

    serialPort = new SerialPort({
      path: SERIAL_PATH,
      baudRate: SERIAL_BAUD,
      autoOpen: false,
    });

    parser = serialPort.pipe(
      new ReadlineParser({
        delimiter: '\n',
      })
    );

    serialPort.open((err) => {

      if (err) {

        console.error(`[SERIAL] Failed to open: ${err.message}`);

        console.log('[SERIAL] Falling back to SIMULATION MODE');

        simulationMode = true;

        broadcastToClients({
          type: 'SYSTEM',
          message: 'Arduino not found - simulation mode active',
        });

        return;
      }

      isConnected = true;
      simulationMode = false;

      console.log(`[SERIAL] Connected to ${SERIAL_PATH}`);

      broadcastToClients({
        type: 'SYSTEM',
        message: 'Arduino connected'
      });

      // IMPORTANT:
      // Arduino resets when serial port opens.
      // Give it time to boot before sending commands.
      setTimeout(() => {

        console.log('[SERIAL] Arduino boot delay complete');

        processQueue();

      }, 3000);
    });

    // PARSED LINES
    parser.on('data', (line) => {

      const trimmed = line.trim();

      if (!trimmed) return;

      console.log(`[ARDUINO → WS] ${trimmed}`);

      const parsed = parseArduinoResponse(trimmed);

      broadcastToClients(parsed);

      // DONE / ERROR handling
      if (pendingResolver) {

        const matched =
          parsed.type === 'DONE' &&
          parsed.command === pendingCommand;

        if (matched || parsed.type === 'ERROR') {

          const r = pendingResolver;

          pendingResolver = null;
          pendingCommand = null;

          if (pendingTimer) {
            clearTimeout(pendingTimer);
            pendingTimer = null;
          }

          r();
        }
      }
    });

    serialPort.on('error', (err) => {

      console.error(`[SERIAL] Error: ${err.message}`);

      isConnected = false;
    });

    serialPort.on('close', () => {

      console.log('[SERIAL] Connection closed');

      isConnected = false;

      setTimeout(connectSerial, RECONNECT_INTERVAL);
    });

  } catch (err) {

    console.error(`[SERIAL] Exception: ${err.message}`);

    simulationMode = true;
  }
}

// ========== PARSE ==========
function parseArduinoResponse(line) {

  const parts = line.split(':');

  const type = parts[0];

  switch (type) {

    case 'ACK':
      return {
        type: 'ACK',
        command: parts[1] || '',
        data: parts.slice(2).join(':')
      };

    case 'DONE':
      return {
        type: 'DONE',
        command: parts[1] || '',
        data: parts.slice(2).join(':')
      };

    case 'STATUS':
      return {
        type: 'STATUS',
        state: parts[1] || '',
        details: parts.slice(2).join(':')
      };

    case 'ERROR':
      return {
        type: 'ERROR',
        code: parts[1] || '',
        message: parts.slice(2).join(':')
      };

    default:
      return {
        type: 'RAW',
        message: line
      };
  }
}

// ========== SIMULATION ==========
function simulateCommand(cmd, params) {

  console.log(`[SIMULATION] ${cmd}:${params}`);

  broadcastToClients({
    type: 'ACK',
    command: cmd,
    data: params,
  });

  setTimeout(() => {

    broadcastToClients({
      type: 'DONE',
      command: cmd,
    });

  }, 1000);
}

// ========== SEND ==========
function sendToArduino(command, params) {

  const fullCmd =
    params && params !== ''
      ? `${command}:${params}\n`
      : `${command}\n`;

  if (simulationMode) {

    simulateCommand(command, params || '');

    return;
  }

  if (!isConnected || !serialPort) {

    broadcastToClients({
      type: 'ERROR',
      code: 'NO_CONNECTION',
      message: 'Arduino not connected',
    });

    return;
  }

  commandQueue.push({
    raw: fullCmd,
    command,
  });

  if (!processingQueue) {
    processQueue();
  }
}

// ========== PROCESS QUEUE ==========
async function processQueue() {

  if (processingQueue) return;

  processingQueue = true;

  while (commandQueue.length > 0) {

    const { raw, command } = commandQueue.shift();

    console.log(`[WS → ARDUINO] ${raw.trim()}`);

    const wait = new Promise((resolve) => {

      pendingResolver = resolve;

      pendingCommand = command;

      pendingTimer = setTimeout(() => {

        console.warn(`[QUEUE] Timeout waiting for DONE:${command}`);

        if (pendingResolver) {

          const r = pendingResolver;

          pendingResolver = null;
          pendingCommand = null;
          pendingTimer = null;

          r();
        }

      }, COMMAND_TIMEOUT_MS);
    });

    serialPort.write(raw, (err) => {

      if (err) {

        console.error(`[SERIAL] Write error: ${err.message}`);

        broadcastToClients({
          type: 'ERROR',
          code: 'WRITE_FAIL',
          message: err.message,
        });

        return;
      }

      serialPort.drain(() => {
        console.log(`[SERIAL] Sent -> ${raw.trim()}`);
      });
    });

    await wait;

    await new Promise((r) =>
      setTimeout(r, MIN_COMMAND_GAP_MS)
    );
  }

  processingQueue = false;
}

// ========== WEBSOCKET ==========
const wss = new WebSocketServer({
  port: WS_PORT
});

wss.on('listening', () => {

  console.log(`[WS] WebSocket server running on ws://localhost:${WS_PORT}`);
});

wss.on('connection', (ws) => {

  wsClients.add(ws);

  console.log(`[WS] Client connected (total: ${wsClients.size})`);

  ws.send(JSON.stringify({
    type: 'SYSTEM',
    message: simulationMode
      ? 'Connected (simulation mode)'
      : 'Connected to Arduino',
    simulationMode,
    isConnected,
  }));

  ws.on('message', (data) => {

    try {

      const msg = JSON.parse(data.toString());

      const { command, params } = msg;

      if (!command) {

        ws.send(JSON.stringify({
          type: 'ERROR',
          code: 'NO_CMD',
          message: 'Missing command field',
        }));

        return;
      }

      sendToArduino(
        command.toUpperCase(),
        params || ''
      );

    } catch {

      ws.send(JSON.stringify({
        type: 'ERROR',
        code: 'PARSE',
        message: 'Invalid JSON',
      }));
    }
  });

  ws.on('close', () => {

    wsClients.delete(ws);

    console.log(`[WS] Client disconnected (total: ${wsClients.size})`);
  });
});

// ========== BROADCAST ==========
function broadcastToClients(data) {

  const json = JSON.stringify(data);

  for (const client of wsClients) {

    if (client.readyState === 1) {
      client.send(json);
    }
  }
}

// ========== STARTUP ==========
console.log('');

console.log('╔══════════════════════════════════════════╗');
console.log('║    AutoShop Serial Bridge Server v2.3    ║');
console.log('╠══════════════════════════════════════════╣');

console.log(`║  Serial: ${SERIAL_PATH.padEnd(30)}║`);
console.log(`║  Baud:   ${String(SERIAL_BAUD).padEnd(30)}║`);
console.log(`║  WS:     ws://localhost:${String(WS_PORT).padEnd(19)}║`);

console.log('╚══════════════════════════════════════════╝');

console.log('');

connectSerial();

// ========== SHUTDOWN ==========
process.on('SIGINT', () => {

  console.log('\n[SHUTDOWN] Cleaning up...');

  if (isConnected && serialPort) {

    serialPort.write('ESTOP\n');

    setTimeout(() => {

      serialPort.close();

      process.exit(0);

    }, 500);

  } else {

    process.exit(0);
  }
});






























// #!/usr/bin/env node
// /**
//  * AutoShop Serial Bridge Server v2.3
//  */

// const { SerialPort } = require('serialport');
// const { ReadlineParser } = require('@serialport/parser-readline');
// const { WebSocketServer } = require('ws');

// // ========== CONFIGURATION ==========
// const SERIAL_PATH = process.argv[2] || '/dev/ttyACM0';
// const SERIAL_BAUD = parseInt(process.argv[3]) || 9600;

// const WS_PORT = 8765;
// const RECONNECT_INTERVAL = 3000;

// const COMMAND_TIMEOUT_MS = 30000;
// const MIN_COMMAND_GAP_MS = 200;

// // ========== STATE ==========
// let serialPort = null;
// let parser = null;

// let wsClients = new Set();

// let isConnected = false;
// let simulationMode = false;

// let commandQueue = [];
// let processingQueue = false;

// let pendingResolver = null;
// let pendingCommand = null;
// let pendingTimer = null;

// // ========== SERIAL CONNECTION ==========
// function connectSerial() {

//   console.log(`[SERIAL] Connecting to ${SERIAL_PATH} at ${SERIAL_BAUD} baud...`);

//   try {

//     serialPort = new SerialPort({
//       path: SERIAL_PATH,
//       baudRate: SERIAL_BAUD,
//       autoOpen: false,
//     });

//     parser = serialPort.pipe(
//       new ReadlineParser({
//         delimiter: '\n',
//       })
//     );

//     serialPort.open((err) => {

//       if (err) {

//         console.error(`[SERIAL] Failed to open: ${err.message}`);

//         console.log('[SERIAL] Falling back to SIMULATION MODE');

//         simulationMode = true;

//         broadcastToClients({
//           type: 'SYSTEM',
//           message: 'Arduino not found - simulation mode active',
//         });

//         return;
//       }

//       isConnected = true;
//       simulationMode = false;

//       console.log(`[SERIAL] Connected to ${SERIAL_PATH}`);

//       broadcastToClients({
//         type: 'SYSTEM',
//         message: 'Arduino connected'
//       });

//       // IMPORTANT:
//       // Arduino resets when serial port opens.
//       // Give it time to boot before sending commands.
//       setTimeout(() => {

//         console.log('[SERIAL] Arduino boot delay complete');

//         processQueue();

//       }, 3000);
//     });

//     // RAW SERIAL DEBUG
//     serialPort.on('data', (data) => {

//       const raw = data.toString();

//       if (raw.trim()) {
//         console.log(`[RAW SERIAL] ${JSON.stringify(raw)}`);
//       }
//     });

//     // PARSED LINES
//     parser.on('data', (line) => {

//       const trimmed = line.trim();

//       if (!trimmed) return;

//       console.log(`[ARDUINO → WS] ${trimmed}`);

//       const parsed = parseArduinoResponse(trimmed);

//       broadcastToClients(parsed);

//       // DONE / ERROR handling
//       if (pendingResolver) {

//         const matched =
//           parsed.type === 'DONE' &&
//           parsed.command === pendingCommand;

//         if (matched || parsed.type === 'ERROR') {

//           const r = pendingResolver;

//           pendingResolver = null;
//           pendingCommand = null;

//           if (pendingTimer) {
//             clearTimeout(pendingTimer);
//             pendingTimer = null;
//           }

//           r();
//         }
//       }
//     });

//     serialPort.on('error', (err) => {

//       console.error(`[SERIAL] Error: ${err.message}`);

//       isConnected = false;
//     });

//     serialPort.on('close', () => {

//       console.log('[SERIAL] Connection closed');

//       isConnected = false;

//       setTimeout(connectSerial, RECONNECT_INTERVAL);
//     });

//   } catch (err) {

//     console.error(`[SERIAL] Exception: ${err.message}`);

//     simulationMode = true;
//   }
// }

// // ========== PARSE ==========
// function parseArduinoResponse(line) {

//   const parts = line.split(':');

//   const type = parts[0];

//   switch (type) {

//     case 'ACK':
//       return {
//         type: 'ACK',
//         command: parts[1] || '',
//         data: parts.slice(2).join(':')
//       };

//     case 'DONE':
//       return {
//         type: 'DONE',
//         command: parts[1] || '',
//         data: parts.slice(2).join(':')
//       };

//     case 'STATUS':
//       return {
//         type: 'STATUS',
//         state: parts[1] || '',
//         details: parts.slice(2).join(':')
//       };

//     case 'ERROR':
//       return {
//         type: 'ERROR',
//         code: parts[1] || '',
//         message: parts.slice(2).join(':')
//       };

//     default:
//       return {
//         type: 'RAW',
//         message: line
//       };
//   }
// }

// // ========== SIMULATION ==========
// function simulateCommand(cmd, params) {

//   console.log(`[SIMULATION] ${cmd}:${params}`);

//   broadcastToClients({
//     type: 'ACK',
//     command: cmd,
//     data: params,
//   });

//   setTimeout(() => {

//     broadcastToClients({
//       type: 'DONE',
//       command: cmd,
//     });

//   }, 1000);
// }

// // ========== SEND ==========
// function sendToArduino(command, params) {

//   const fullCmd =
//     params && params !== ''
//       ? `${command}:${params}\n`
//       : `${command}\n`;

//   if (simulationMode) {

//     simulateCommand(command, params || '');

//     return;
//   }

//   if (!isConnected || !serialPort) {

//     broadcastToClients({
//       type: 'ERROR',
//       code: 'NO_CONNECTION',
//       message: 'Arduino not connected',
//     });

//     return;
//   }

//   commandQueue.push({
//     raw: fullCmd,
//     command,
//   });

//   if (!processingQueue) {
//     processQueue();
//   }
// }

// // ========== PROCESS QUEUE ==========
// async function processQueue() {

//   if (processingQueue) return;

//   processingQueue = true;

//   while (commandQueue.length > 0) {

//     const { raw, command } = commandQueue.shift();

//     console.log(`[WS → ARDUINO] ${raw.trim()}`);

//     const wait = new Promise((resolve) => {

//       pendingResolver = resolve;

//       pendingCommand = command;

//       pendingTimer = setTimeout(() => {

//         console.warn(`[QUEUE] Timeout waiting for DONE:${command}`);

//         if (pendingResolver) {

//           const r = pendingResolver;

//           pendingResolver = null;
//           pendingCommand = null;
//           pendingTimer = null;

//           r();
//         }

//       }, COMMAND_TIMEOUT_MS);
//     });

//     serialPort.write(raw, (err) => {

//       if (err) {

//         console.error(`[SERIAL] Write error: ${err.message}`);

//         broadcastToClients({
//           type: 'ERROR',
//           code: 'WRITE_FAIL',
//           message: err.message,
//         });

//         return;
//       }

//       serialPort.drain(() => {
//         console.log(`[SERIAL] Sent -> ${raw.trim()}`);
//       });
//     });

//     await wait;

//     await new Promise((r) =>
//       setTimeout(r, MIN_COMMAND_GAP_MS)
//     );
//   }

//   processingQueue = false;
// }

// // ========== WEBSOCKET ==========
// const wss = new WebSocketServer({
//   port: WS_PORT
// });

// wss.on('listening', () => {

//   console.log(`[WS] WebSocket server running on ws://localhost:${WS_PORT}`);
// });

// wss.on('connection', (ws) => {

//   wsClients.add(ws);

//   console.log(`[WS] Client connected (total: ${wsClients.size})`);

//   ws.send(JSON.stringify({
//     type: 'SYSTEM',
//     message: simulationMode
//       ? 'Connected (simulation mode)'
//       : 'Connected to Arduino',
//     simulationMode,
//     isConnected,
//   }));

//   ws.on('message', (data) => {

//     try {

//       const msg = JSON.parse(data.toString());

//       const { command, params } = msg;

//       if (!command) {

//         ws.send(JSON.stringify({
//           type: 'ERROR',
//           code: 'NO_CMD',
//           message: 'Missing command field',
//         }));

//         return;
//       }

//       sendToArduino(
//         command.toUpperCase(),
//         params || ''
//       );

//     } catch {

//       ws.send(JSON.stringify({
//         type: 'ERROR',
//         code: 'PARSE',
//         message: 'Invalid JSON',
//       }));
//     }
//   });

//   ws.on('close', () => {

//     wsClients.delete(ws);

//     console.log(`[WS] Client disconnected (total: ${wsClients.size})`);
//   });
// });

// // ========== BROADCAST ==========
// function broadcastToClients(data) {

//   const json = JSON.stringify(data);

//   for (const client of wsClients) {

//     if (client.readyState === 1) {
//       client.send(json);
//     }
//   }
// }

// // ========== STARTUP ==========
// console.log('');

// console.log('╔══════════════════════════════════════════╗');
// console.log('║    AutoShop Serial Bridge Server v2.3    ║');
// console.log('╠══════════════════════════════════════════╣');

// console.log(`║  Serial: ${SERIAL_PATH.padEnd(30)}║`);
// console.log(`║  Baud:   ${String(SERIAL_BAUD).padEnd(30)}║`);
// console.log(`║  WS:     ws://localhost:${String(WS_PORT).padEnd(19)}║`);

// console.log('╚══════════════════════════════════════════╝');

// console.log('');

// connectSerial();

// // ========== SHUTDOWN ==========
// process.on('SIGINT', () => {

//   console.log('\n[SHUTDOWN] Cleaning up...');

//   if (isConnected && serialPort) {

//     serialPort.write('ESTOP\n');

//     setTimeout(() => {

//       serialPort.close();

//       process.exit(0);

//     }, 500);

//   } else {

//     process.exit(0);
//   }
// });



























// #!/usr/bin/env node
// /**
//  * AutoShop Serial Bridge Server v2.3
//  */

// const { SerialPort } = require('serialport');
// const { ReadlineParser } = require('@serialport/parser-readline');
// const { WebSocketServer } = require('ws');

// // ========== CONFIGURATION ==========
// const SERIAL_PATH = process.argv[2] || '/dev/ttyACM0';
// const SERIAL_BAUD = parseInt(process.argv[3]) || 9600;

// const WS_PORT = 8765;
// const RECONNECT_INTERVAL = 3000;

// const COMMAND_TIMEOUT_MS = 30000;
// const MIN_COMMAND_GAP_MS = 200;

// // ========== STATE ==========
// let serialPort = null;
// let parser = null;

// let wsClients = new Set();

// let isConnected = false;
// let simulationMode = false;

// let commandQueue = [];
// let processingQueue = false;

// let pendingResolver = null;
// let pendingCommand = null;
// let pendingTimer = null;

// // ========== SERIAL CONNECTION ==========
// function connectSerial() {

//   console.log(`[SERIAL] Connecting to ${SERIAL_PATH} at ${SERIAL_BAUD} baud...`);

//   try {

//     serialPort = new SerialPort({
//       path: SERIAL_PATH,
//       baudRate: SERIAL_BAUD,
//       autoOpen: false,
//     });

//     serialPort.setEncoding('utf8');

//     parser = serialPort.pipe(
//       new ReadlineParser({
//         delimiter: '\n',
//       })
//     );

//     serialPort.open((err) => {

//       if (err) {

//         console.error(`[SERIAL] Failed to open: ${err.message}`);

//         console.log('[SERIAL] Falling back to SIMULATION MODE');

//         simulationMode = true;

//         broadcastToClients({
//           type: 'SYSTEM',
//           message: 'Arduino not found - simulation mode active',
//         });

//         return;
//       }

//       isConnected = true;
//       simulationMode = false;

//       console.log(`[SERIAL] Connected to ${SERIAL_PATH}`);

//       broadcastToClients({
//         type: 'SYSTEM',
//         message: 'Arduino connected'
//       });

//       // IMPORTANT:
//       // Arduino resets when serial port opens.
//       // Give it time to boot before sending commands.
//       setTimeout(() => {

//         console.log('[SERIAL] Arduino boot delay complete');

//         processQueue();

//       }, 3000);
//     });

//     // RAW SERIAL DEBUG
//     serialPort.on('data', (data) => {

//       const raw = data.toString();

//       if (raw.trim()) {
//         console.log(`[RAW SERIAL] ${JSON.stringify(raw)}`);
//       }
//     });

//     // PARSED LINES
//     parser.on('data', (line) => {

//       const trimmed = line.trim();

//       if (!trimmed) return;

//       console.log(`[ARDUINO → WS] ${trimmed}`);

//       const parsed = parseArduinoResponse(trimmed);

//       broadcastToClients(parsed);

//       // DONE / ERROR handling
//       if (pendingResolver) {

//         const matched =
//           parsed.type === 'DONE' &&
//           parsed.command === pendingCommand;

//         if (matched || parsed.type === 'ERROR') {

//           const r = pendingResolver;

//           pendingResolver = null;
//           pendingCommand = null;

//           if (pendingTimer) {
//             clearTimeout(pendingTimer);
//             pendingTimer = null;
//           }

//           r();
//         }
//       }
//     });

//     serialPort.on('error', (err) => {

//       console.error(`[SERIAL] Error: ${err.message}`);

//       isConnected = false;
//     });

//     serialPort.on('close', () => {

//       console.log('[SERIAL] Connection closed');

//       isConnected = false;

//       setTimeout(connectSerial, RECONNECT_INTERVAL);
//     });

//   } catch (err) {

//     console.error(`[SERIAL] Exception: ${err.message}`);

//     simulationMode = true;
//   }
// }

// // ========== PARSE ==========
// function parseArduinoResponse(line) {

//   const parts = line.split(':');

//   const type = parts[0];

//   switch (type) {

//     case 'ACK':
//       return {
//         type: 'ACK',
//         command: parts[1] || '',
//         data: parts.slice(2).join(':')
//       };

//     case 'DONE':
//       return {
//         type: 'DONE',
//         command: parts[1] || '',
//         data: parts.slice(2).join(':')
//       };

//     case 'STATUS':
//       return {
//         type: 'STATUS',
//         state: parts[1] || '',
//         details: parts.slice(2).join(':')
//       };

//     case 'ERROR':
//       return {
//         type: 'ERROR',
//         code: parts[1] || '',
//         message: parts.slice(2).join(':')
//       };

//     default:
//       return {
//         type: 'RAW',
//         message: line
//       };
//   }
// }

// // ========== SIMULATION ==========
// function simulateCommand(cmd, params) {

//   console.log(`[SIMULATION] ${cmd}:${params}`);

//   broadcastToClients({
//     type: 'ACK',
//     command: cmd,
//     data: params,
//   });

//   setTimeout(() => {

//     broadcastToClients({
//       type: 'DONE',
//       command: cmd,
//     });

//   }, 1000);
// }

// // ========== SEND ==========
// function sendToArduino(command, params) {

//   const fullCmd =
//     params && params !== ''
//       ? `${command}:${params}\n`
//       : `${command}\n`;

//   if (simulationMode) {

//     simulateCommand(command, params || '');

//     return;
//   }

//   if (!isConnected || !serialPort) {

//     broadcastToClients({
//       type: 'ERROR',
//       code: 'NO_CONNECTION',
//       message: 'Arduino not connected',
//     });

//     return;
//   }

//   commandQueue.push({
//     raw: fullCmd,
//     command,
//   });

//   if (!processingQueue) {
//     processQueue();
//   }
// }

// // ========== PROCESS QUEUE ==========
// async function processQueue() {

//   if (processingQueue) return;

//   processingQueue = true;

//   while (commandQueue.length > 0) {

//     const { raw, command } = commandQueue.shift();

//     console.log(`[WS → ARDUINO] ${raw.trim()}`);

//     const wait = new Promise((resolve) => {

//       pendingResolver = resolve;

//       pendingCommand = command;

//       pendingTimer = setTimeout(() => {

//         console.warn(`[QUEUE] Timeout waiting for DONE:${command}`);

//         if (pendingResolver) {

//           const r = pendingResolver;

//           pendingResolver = null;
//           pendingCommand = null;
//           pendingTimer = null;

//           r();
//         }

//       }, COMMAND_TIMEOUT_MS);
//     });

//     serialPort.write(raw, (err) => {

//       if (err) {

//         console.error(`[SERIAL] Write error: ${err.message}`);

//         broadcastToClients({
//           type: 'ERROR',
//           code: 'WRITE_FAIL',
//           message: err.message,
//         });

//         return;
//       }

//       serialPort.drain(() => {
//         console.log(`[SERIAL] Sent -> ${raw.trim()}`);
//       });
//     });

//     await wait;

//     await new Promise((r) =>
//       setTimeout(r, MIN_COMMAND_GAP_MS)
//     );
//   }

//   processingQueue = false;
// }

// // ========== WEBSOCKET ==========
// const wss = new WebSocketServer({
//   port: WS_PORT
// });

// wss.on('listening', () => {

//   console.log(`[WS] WebSocket server running on ws://localhost:${WS_PORT}`);
// });

// wss.on('connection', (ws) => {

//   wsClients.add(ws);

//   console.log(`[WS] Client connected (total: ${wsClients.size})`);

//   ws.send(JSON.stringify({
//     type: 'SYSTEM',
//     message: simulationMode
//       ? 'Connected (simulation mode)'
//       : 'Connected to Arduino',
//     simulationMode,
//     isConnected,
//   }));

//   ws.on('message', (data) => {

//     try {

//       const msg = JSON.parse(data.toString());

//       const { command, params } = msg;

//       if (!command) {

//         ws.send(JSON.stringify({
//           type: 'ERROR',
//           code: 'NO_CMD',
//           message: 'Missing command field',
//         }));

//         return;
//       }

//       sendToArduino(
//         command.toUpperCase(),
//         params || ''
//       );

//     } catch {

//       ws.send(JSON.stringify({
//         type: 'ERROR',
//         code: 'PARSE',
//         message: 'Invalid JSON',
//       }));
//     }
//   });

//   ws.on('close', () => {

//     wsClients.delete(ws);

//     console.log(`[WS] Client disconnected (total: ${wsClients.size})`);
//   });
// });

// // ========== BROADCAST ==========
// function broadcastToClients(data) {

//   const json = JSON.stringify(data);

//   for (const client of wsClients) {

//     if (client.readyState === 1) {
//       client.send(json);
//     }
//   }
// }

// // ========== STARTUP ==========
// console.log('');

// console.log('╔══════════════════════════════════════════╗');
// console.log('║    AutoShop Serial Bridge Server v2.3    ║');
// console.log('╠══════════════════════════════════════════╣');

// console.log(`║  Serial: ${SERIAL_PATH.padEnd(30)}║`);
// console.log(`║  Baud:   ${String(SERIAL_BAUD).padEnd(30)}║`);
// console.log(`║  WS:     ws://localhost:${String(WS_PORT).padEnd(19)}║`);

// console.log('╚══════════════════════════════════════════╝');

// console.log('');

// connectSerial();

// // ========== SHUTDOWN ==========
// process.on('SIGINT', () => {

//   console.log('\n[SHUTDOWN] Cleaning up...');

//   if (isConnected && serialPort) {

//     serialPort.write('ESTOP\n');

//     setTimeout(() => {

//       serialPort.close();

//       process.exit(0);

//     }, 500);

//   } else {

//     process.exit(0);
//   }
// });































// almost there 
// #!/usr/bin/env node
// /**
//  * AutoShop Serial Bridge Server v2.3
//  */

// const { SerialPort } = require('serialport');
// const { ReadlineParser } = require('@serialport/parser-readline');
// const { WebSocketServer } = require('ws');

// // ========== CONFIGURATION ==========
// const SERIAL_PATH = process.argv[2] || '/dev/ttyACM0';
// const SERIAL_BAUD = parseInt(process.argv[3]) || 9600;

// const WS_PORT = 8765;
// const RECONNECT_INTERVAL = 3000;

// const COMMAND_TIMEOUT_MS = 30000;
// const MIN_COMMAND_GAP_MS = 200;

// // ========== STATE ==========
// let serialPort = null;
// let parser = null;

// let wsClients = new Set();

// let isConnected = false;
// let simulationMode = false;

// let commandQueue = [];
// let processingQueue = false;

// let pendingResolver = null;
// let pendingCommand = null;
// let pendingTimer = null;

// // ========== SERIAL CONNECTION ==========
// function connectSerial() {

//   console.log(`[SERIAL] Connecting to ${SERIAL_PATH} at ${SERIAL_BAUD} baud...`);

//   try {

//     serialPort = new SerialPort({
//       path: SERIAL_PATH,
//       baudRate: SERIAL_BAUD,
//       autoOpen: false,
//     });

//     serialPort.setEncoding('utf8');

//     parser = serialPort.pipe(
//       new ReadlineParser({
//         delimiter: '\n',
//       })
//     );

//     serialPort.open((err) => {

//       if (err) {

//         console.error(`[SERIAL] Failed to open: ${err.message}`);

//         console.log('[SERIAL] Falling back to SIMULATION MODE');

//         simulationMode = true;

//         broadcastToClients({
//           type: 'SYSTEM',
//           message: 'Arduino not found - simulation mode active',
//         });

//         return;
//       }

//       isConnected = true;
//       simulationMode = false;

//       console.log(`[SERIAL] Connected to ${SERIAL_PATH}`);

//       // IMPORTANT
//       // Arduino resets when serial opens
//       // give it time to boot
//       setTimeout(() => {

//         console.log('[SERIAL] Arduino boot wait complete');

//         broadcastToClients({
//           type: 'SYSTEM',
//           message: 'Arduino connected',
//         });

//         processQueue();

//       }, 3000);
//     });

//     // RAW SERIAL DEBUG
//     serialPort.on('data', (data) => {

//       const raw = data.toString();

//       if (raw.trim()) {
//         console.log(`[RAW SERIAL] ${JSON.stringify(raw)}`);
//       }
//     });

//     // PARSED LINES
//     parser.on('data', (line) => {

//       const trimmed = line.trim();

//       if (!trimmed) return;

//       console.log(`[ARDUINO → WS] ${trimmed}`);

//       const parsed = parseArduinoResponse(trimmed);

//       broadcastToClients(parsed);

//       // DONE / ERROR handling
//       if (pendingResolver) {

//         const matched =
//           parsed.type === 'DONE' &&
//           parsed.command === pendingCommand;

//         if (matched || parsed.type === 'ERROR') {

//           const r = pendingResolver;

//           pendingResolver = null;
//           pendingCommand = null;

//           if (pendingTimer) {
//             clearTimeout(pendingTimer);
//             pendingTimer = null;
//           }

//           r();
//         }
//       }
//     });

//     serialPort.on('error', (err) => {

//       console.error(`[SERIAL] Error: ${err.message}`);

//       isConnected = false;
//     });

//     serialPort.on('close', () => {

//       console.log('[SERIAL] Connection closed');

//       isConnected = false;

//       setTimeout(connectSerial, RECONNECT_INTERVAL);
//     });

//   } catch (err) {

//     console.error(`[SERIAL] Exception: ${err.message}`);

//     simulationMode = true;
//   }
// }

// // ========== PARSE ==========
// function parseArduinoResponse(line) {

//   const parts = line.split(':');

//   const type = parts[0];

//   switch (type) {

//     case 'ACK':
//       return {
//         type: 'ACK',
//         command: parts[1] || '',
//         data: parts.slice(2).join(':')
//       };

//     case 'DONE':
//       return {
//         type: 'DONE',
//         command: parts[1] || '',
//         data: parts.slice(2).join(':')
//       };

//     case 'STATUS':
//       return {
//         type: 'STATUS',
//         state: parts[1] || '',
//         details: parts.slice(2).join(':')
//       };

//     case 'ERROR':
//       return {
//         type: 'ERROR',
//         code: parts[1] || '',
//         message: parts.slice(2).join(':')
//       };

//     default:
//       return {
//         type: 'RAW',
//         message: line
//       };
//   }
// }

// // ========== SIMULATION ==========
// function simulateCommand(cmd, params) {

//   console.log(`[SIMULATION] ${cmd}:${params}`);

//   broadcastToClients({
//     type: 'ACK',
//     command: cmd,
//     data: params,
//   });

//   setTimeout(() => {

//     broadcastToClients({
//       type: 'DONE',
//       command: cmd,
//     });

//   }, 1000);
// }

// // ========== SEND ==========
// function sendToArduino(command, params) {

//   const fullCmd =
//     params && params !== ''
//       ? `${command}:${params}\n`
//       : `${command}\n`;

//   if (simulationMode) {

//     simulateCommand(command, params || '');

//     return;
//   }

//   if (!isConnected || !serialPort) {

//     broadcastToClients({
//       type: 'ERROR',
//       code: 'NO_CONNECTION',
//       message: 'Arduino not connected',
//     });

//     return;
//   }

//   commandQueue.push({
//     raw: fullCmd,
//     command,
//   });

//   if (!processingQueue) {
//     processQueue();
//   }
// }

// // ========== PROCESS QUEUE ==========
// async function processQueue() {

//   if (processingQueue) return;

//   processingQueue = true;

//   while (commandQueue.length > 0) {

//     const { raw, command } = commandQueue.shift();

//     console.log(`[WS → ARDUINO] ${raw.trim()}`);

//     const wait = new Promise((resolve) => {

//       pendingResolver = resolve;

//       pendingCommand = command;

//       pendingTimer = setTimeout(() => {

//         console.warn(`[QUEUE] Timeout waiting for DONE:${command}`);

//         if (pendingResolver) {

//           const r = pendingResolver;

//           pendingResolver = null;
//           pendingCommand = null;
//           pendingTimer = null;

//           r();
//         }

//       }, COMMAND_TIMEOUT_MS);
//     });

//     serialPort.write(raw, (err) => {

//       if (err) {

//         console.error(`[SERIAL] Write error: ${err.message}`);

//         broadcastToClients({
//           type: 'ERROR',
//           code: 'WRITE_FAIL',
//           message: err.message,
//         });

//         return;
//       }

//       serialPort.drain(() => {
//         console.log(`[SERIAL] Sent -> ${raw.trim()}`);
//       });
//     });

//     await wait;

//     await new Promise((r) =>
//       setTimeout(r, MIN_COMMAND_GAP_MS)
//     );
//   }

//   processingQueue = false;
// }

// // ========== WEBSOCKET ==========
// const wss = new WebSocketServer({
//   port: WS_PORT
// });

// wss.on('listening', () => {

//   console.log(`[WS] WebSocket server running on ws://localhost:${WS_PORT}`);
// });

// wss.on('connection', (ws) => {

//   wsClients.add(ws);

//   console.log(`[WS] Client connected (total: ${wsClients.size})`);

//   ws.send(JSON.stringify({
//     type: 'SYSTEM',
//     message: simulationMode
//       ? 'Connected (simulation mode)'
//       : 'Connected to Arduino',
//     simulationMode,
//     isConnected,
//   }));

//   ws.on('message', (data) => {

//     try {

//       const msg = JSON.parse(data.toString());

//       const { command, params } = msg;

//       if (!command) {

//         ws.send(JSON.stringify({
//           type: 'ERROR',
//           code: 'NO_CMD',
//           message: 'Missing command field',
//         }));

//         return;
//       }

//       sendToArduino(
//         command.toUpperCase(),
//         params || ''
//       );

//     } catch {

//       ws.send(JSON.stringify({
//         type: 'ERROR',
//         code: 'PARSE',
//         message: 'Invalid JSON',
//       }));
//     }
//   });

//   ws.on('close', () => {

//     wsClients.delete(ws);

//     console.log(`[WS] Client disconnected (total: ${wsClients.size})`);
//   });
// });

// // ========== BROADCAST ==========
// function broadcastToClients(data) {

//   const json = JSON.stringify(data);

//   for (const client of wsClients) {

//     if (client.readyState === 1) {
//       client.send(json);
//     }
//   }
// }

// // ========== STARTUP ==========
// console.log('');

// console.log('╔══════════════════════════════════════════╗');
// console.log('║    AutoShop Serial Bridge Server v2.3    ║');
// console.log('╠══════════════════════════════════════════╣');

// console.log(`║  Serial: ${SERIAL_PATH.padEnd(30)}║`);
// console.log(`║  Baud:   ${String(SERIAL_BAUD).padEnd(30)}║`);
// console.log(`║  WS:     ws://localhost:${String(WS_PORT).padEnd(19)}║`);

// console.log('╚══════════════════════════════════════════╝');

// console.log('');

// connectSerial();

// // ========== SHUTDOWN ==========
// process.on('SIGINT', () => {

//   console.log('\n[SHUTDOWN] Cleaning up...');

//   if (isConnected && serialPort) {

//     serialPort.write('ESTOP\n');

//     setTimeout(() => {

//       serialPort.close();

//       process.exit(0);

//     }, 500);

//   } else {

//     process.exit(0);
//   }
// });
















//almost 
// #!/usr/bin/env node
// /**
//  * AutoShop Serial Bridge Server v2.2
//  * Bridges Arduino (USB Serial) ↔ Web App (WebSocket)
//  *
//  * Hardware-aware: lets the Arduino's DONE message decide when a command is
//  * finished, instead of using a hard-coded delay. Falls back to a long
//  * timeout so the queue can never get stuck.
//  */

// const { SerialPort } = require('serialport');
// const { ReadlineParser } = require('@serialport/parser-readline');
// const { WebSocketServer } = require('ws');

// // ========== CONFIGURATION ==========
// const SERIAL_PATH = process.argv[2] || '/dev/ttyACM0';
// const SERIAL_BAUD = parseInt(process.argv[3]) || 9600;
// const WS_PORT = 8765;
// const RECONNECT_INTERVAL = 3000;

// // Max time we will wait for a DONE/ERROR response before moving on.
// // Long enough for: shelf cycle (~2.5s) + conveyor run (~5s per unit) + slack.
// const COMMAND_TIMEOUT_MS = 30000;

// // Minimum spacing between commands (prevents flooding the Arduino)
// const MIN_COMMAND_GAP_MS = 100;

// // ========== STATE ==========
// let serialPort = null;
// let parser = null;
// let wsClients = new Set();
// let isConnected = false;
// let simulationMode = false;
// let commandQueue = [];
// let processingQueue = false;

// // resolves when the current command receives DONE / ERROR
// let pendingResolver = null;
// let pendingCommand = null;
// let pendingTimer = null;

// // ========== SERIAL CONNECTION ==========
// function connectSerial() {
//   console.log(`[SERIAL] Connecting to ${SERIAL_PATH} at ${SERIAL_BAUD} baud...`);

//   try {
//     serialPort = new SerialPort({
//       path: SERIAL_PATH,
//       baudRate: SERIAL_BAUD,
//       autoOpen: false,
//     });

//     parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

//     serialPort.open((err) => {
//       if (err) {
//         console.error(`[SERIAL] Failed to open: ${err.message}`);
//         console.log('[SERIAL] Falling back to SIMULATION MODE');
//         simulationMode = true;
//         broadcastToClients({
//           type: 'SYSTEM',
//           message: 'Arduino not found - simulation mode active',
//         });
//         return;
//       }

//       isConnected = true;
//       simulationMode = false;
//       console.log(`[SERIAL] Connected to ${SERIAL_PATH}`);
//       broadcastToClients({ type: 'SYSTEM', message: 'Arduino connected' });

//       processQueue();
//     });

//     parser.on('data', (line) => {
//       const trimmed = line.trim();
//       if (!trimmed) return;

//       console.log(`[ARDUINO → WS] ${trimmed}`);

//       const parsed = parseArduinoResponse(trimmed);
//       broadcastToClients(parsed);

//       // Resolve queue when matching DONE / ERROR arrives
//       if (pendingResolver) {
//         if (
//           (parsed.type === 'DONE' &&
//             (!pendingCommand || parsed.command === pendingCommand)) ||
//           parsed.type === 'ERROR'
//         ) {
//           const r = pendingResolver;
//           pendingResolver = null;
//           pendingCommand = null;
//           if (pendingTimer) {
//             clearTimeout(pendingTimer);
//             pendingTimer = null;
//           }
//           r();
//         }
//       }
//     });

//     serialPort.on('error', (err) => {
//       console.error(`[SERIAL] Error: ${err.message}`);
//       isConnected = false;
//     });

//     serialPort.on('close', () => {
//       console.log('[SERIAL] Connection closed');
//       isConnected = false;
//       setTimeout(connectSerial, RECONNECT_INTERVAL);
//     });
//   } catch (err) {
//     console.error(`[SERIAL] Exception: ${err.message}`);
//     simulationMode = true;
//   }
// }

// // ========== PARSE ARDUINO RESPONSES ==========
// function parseArduinoResponse(line) {
//   const parts = line.split(':');
//   const type = parts[0];

//   switch (type) {
//     case 'ACK':
//       return { type: 'ACK', command: parts[1] || '', data: parts.slice(2).join(':') };
//     case 'DONE':
//       return { type: 'DONE', command: parts[1] || '', data: parts.slice(2).join(':') };
//     case 'STATUS':
//       return { type: 'STATUS', state: parts[1] || '', details: parts.slice(2).join(':') };
//     case 'ERROR':
//       return { type: 'ERROR', code: parts[1] || '', message: parts.slice(2).join(':') };
//     case 'LOG':
//       return { type: 'LOG', message: parts.slice(1).join(':') };
//     default:
//       return { type: 'RAW', message: line };
//   }
// }

// // ========== SIMULATION MODE ==========
// function simulateCommand(cmd, params) {
//   console.log(`[SIMULATION] ${cmd}:${params}`);
//   broadcastToClients({ type: 'ACK', command: cmd, data: params });
//   setTimeout(() => {
//     broadcastToClients({ type: 'DONE', command: cmd });
//   }, 1000);
// }

// // ========== SEND TO ARDUINO WITH QUEUE ==========
// function sendToArduino(command, params) {
//   const fullCmd =
//     params && params !== '' ? `${command}:${params}\n` : `${command}\n`;

//   if (simulationMode) {
//     simulateCommand(command, params || '');
//     return;
//   }

//   if (!isConnected || !serialPort) {
//     broadcastToClients({
//       type: 'ERROR',
//       code: 'NO_CONNECTION',
//       message: 'Arduino not connected',
//     });
//     return;
//   }

//   commandQueue.push({ raw: fullCmd, command });
//   if (!processingQueue) processQueue();
// }

// // ========== PROCESS QUEUE ==========
// async function processQueue() {
//   if (processingQueue) return;
//   processingQueue = true;

//   while (commandQueue.length > 0) {
//     const { raw, command } = commandQueue.shift();
//     console.log(`[WS → ARDUINO] ${raw.trim()}`);

//     // Set up the wait for DONE/ERROR before writing
//     const wait = new Promise((resolve) => {
//       pendingResolver = resolve;
//       pendingCommand = command;
//       pendingTimer = setTimeout(() => {
//         console.warn(`[QUEUE] Timeout waiting for DONE:${command}`);
//         if (pendingResolver) {
//           const r = pendingResolver;
//           pendingResolver = null;
//           pendingCommand = null;
//           pendingTimer = null;
//           r();
//         }
//       }, COMMAND_TIMEOUT_MS);
//     });

//     serialPort.write(raw, (err) => {
//       if (err) {
//         console.error(`[SERIAL] Write error: ${err.message}`);
//         broadcastToClients({
//           type: 'ERROR',
//           code: 'WRITE_FAIL',
//           message: err.message,
//         });
//       }
//     });

//     await wait;
//     await new Promise((r) => setTimeout(r, MIN_COMMAND_GAP_MS));
//   }

//   processingQueue = false;
// }

// // ========== WEBSOCKET SERVER ==========
// const wss = new WebSocketServer({ port: WS_PORT });

// wss.on('listening', () => {
//   console.log(`[WS] WebSocket server running on ws://localhost:${WS_PORT}`);
// });

// wss.on('connection', (ws) => {
//   wsClients.add(ws);
//   console.log(`[WS] Client connected (total: ${wsClients.size})`);

//   ws.send(
//     JSON.stringify({
//       type: 'SYSTEM',
//       message: simulationMode
//         ? 'Connected (simulation mode)'
//         : 'Connected to Arduino',
//       simulationMode,
//       isConnected,
//     })
//   );

//   ws.on('message', (data) => {
//     try {
//       const msg = JSON.parse(data.toString());
//       const { command, params } = msg;

//       if (!command) {
//         ws.send(
//           JSON.stringify({
//             type: 'ERROR',
//             code: 'NO_CMD',
//             message: 'Missing command field',
//           })
//         );
//         return;
//       }

//       sendToArduino(command.toUpperCase(), params || '');
//     } catch {
//       ws.send(
//         JSON.stringify({ type: 'ERROR', code: 'PARSE', message: 'Invalid JSON' })
//       );
//     }
//   });

//   ws.on('close', () => {
//     wsClients.delete(ws);
//     console.log(`[WS] Client disconnected (total: ${wsClients.size})`);
//   });
// });

// // ========== BROADCAST ==========
// function broadcastToClients(data) {
//   const json = JSON.stringify(data);
//   for (const client of wsClients) {
//     if (client.readyState === 1) client.send(json);
//   }
// }

// // ========== STARTUP ==========
// console.log('');
// console.log('╔══════════════════════════════════════════╗');
// console.log('║    AutoShop Serial Bridge Server v2.2    ║');
// console.log('╠══════════════════════════════════════════╣');
// console.log(`║  Serial: ${SERIAL_PATH.padEnd(30)}║`);
// console.log(`║  Baud:   ${String(SERIAL_BAUD).padEnd(30)}║`);
// console.log(`║  WS:     ws://localhost:${String(WS_PORT).padEnd(19)}║`);
// console.log('╚══════════════════════════════════════════╝');
// console.log('');

// connectSerial();

// // ========== GRACEFUL SHUTDOWN ==========
// process.on('SIGINT', () => {
//   console.log('\n[SHUTDOWN] Cleaning up...');
//   if (isConnected && serialPort) {
//     serialPort.write('ESTOP\n');
//     setTimeout(() => {
//       serialPort.close();
//       process.exit(0);
//     }, 500);
//   } else {
//     process.exit(0);
//   }
// });






























// #!/usr/bin/env node
// /**
//  * AutoShop Serial Bridge Server v2.2
//  * Real hardware: servo shelf (~11s) + DC motor conveyor.
//  */

// const { SerialPort } = require('serialport');
// const { ReadlineParser } = require('@serialport/parser-readline');
// const { WebSocketServer } = require('ws');

// // ========== CONFIGURATION ==========
// const SERIAL_PATH = process.argv[2] || '/dev/ttyACM0';
// const SERIAL_BAUD = parseInt(process.argv[3]) || 9600;
// const WS_PORT = 8765;
// const RECONNECT_INTERVAL = 3000;

// // Per-command pacing (ms). PICK runs the blocking shelf() ~11s on Arduino.
// const COMMAND_DELAY_DEFAULT = 800;
// const COMMAND_DELAYS = {
//   PICK:      12000,
//   PACK:      2500,
//   DELIVER:   4000,
//   COLLECT:   3000,
//   CONVEYOR:  300,
//   ESTOP:     500,
//   RESET:     500,
//   STATUS:    200,
//   HEARTBEAT: 200,
// };

// // ========== STATE ==========
// let serialPort = null;
// let parser = null;
// let wsClients = new Set();
// let isConnected = false;
// let simulationMode = false;
// let commandQueue = [];
// let processingQueue = false;

// // ========== SERIAL ==========
// function connectSerial() {
//   console.log(`[SERIAL] Connecting to ${SERIAL_PATH} at ${SERIAL_BAUD} baud...`);

//   try {
//     serialPort = new SerialPort({
//       path: SERIAL_PATH,
//       baudRate: SERIAL_BAUD,
//       autoOpen: false,
//     });

//     parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

//     serialPort.open((err) => {
//       if (err) {
//         console.error(`[SERIAL] Failed to open: ${err.message}`);
//         console.log('[SERIAL] Falling back to SIMULATION MODE');
//         simulationMode = true;
//         broadcastToClients({ type: 'SYSTEM', message: 'Arduino not found - simulation mode active' });
//         return;
//       }
//       isConnected = true;
//       simulationMode = false;
//       console.log(`[SERIAL] Connected to ${SERIAL_PATH}`);
//       broadcastToClients({ type: 'SYSTEM', message: 'Arduino connected' });
//       processQueue();
//     });

//     parser.on('data', (line) => {
//       const trimmed = line.trim();
//       if (!trimmed) return;
//       console.log(`[ARDUINO → WS] ${trimmed}`);
//       broadcastToClients(parseArduinoResponse(trimmed));
//     });

//     serialPort.on('error', (err) => {
//       console.error(`[SERIAL] Error: ${err.message}`);
//       isConnected = false;
//     });

//     serialPort.on('close', () => {
//       console.log('[SERIAL] Connection closed');
//       isConnected = false;
//       setTimeout(connectSerial, RECONNECT_INTERVAL);
//     });
//   } catch (err) {
//     console.error(`[SERIAL] Exception: ${err.message}`);
//     simulationMode = true;
//   }
// }

// // ========== PARSE ARDUINO RESPONSES ==========
// function parseArduinoResponse(line) {
//   const parts = line.split(':');
//   const type = parts[0];
//   switch (type) {
//     case 'ACK':    return { type: 'ACK',    command: parts[1] || '', data: parts.slice(2).join(':') };
//     case 'DONE':   return { type: 'DONE',   command: parts[1] || '', data: parts.slice(2).join(':') };
//     case 'STATUS': return { type: 'STATUS', state:   parts[1] || '', details: parts.slice(2).join(':') };
//     case 'ERROR':  return { type: 'ERROR',  code:    parts[1] || '', message: parts.slice(2).join(':') };
//     case 'LOG':    return { type: 'LOG',    message: parts.slice(1).join(':') };
//     default:       return { type: 'RAW',    message: line };
//   }
// }

// // ========== SIMULATION ==========
// function simulateCommand(cmd, params) {
//   console.log(`[SIMULATION] ${cmd}:${params}`);
//   broadcastToClients({ type: 'ACK', command: cmd, data: params });
//   setTimeout(() => {
//     broadcastToClients({ type: 'DONE', command: cmd });
//   }, 1000);
// }

// // ========== SEND TO ARDUINO (QUEUED) ==========
// function sendToArduino(command, params) {
//   const fullCmd = (params && params !== '') ? `${command}:${params}\n` : `${command}\n`;

//   if (simulationMode) {
//     simulateCommand(command, params || '');
//     return;
//   }

//   if (!isConnected || !serialPort) {
//     broadcastToClients({ type: 'ERROR', code: 'NO_CONNECTION', message: 'Arduino not connected' });
//     return;
//   }

//   commandQueue.push({ raw: fullCmd, command });
//   if (!processingQueue) processQueue();
// }

// async function processQueue() {
//   if (processingQueue) return;
//   processingQueue = true;

//   while (commandQueue.length > 0) {
//     const { raw, command } = commandQueue.shift();
//     console.log(`[WS → ARDUINO] ${raw.trim()}`);

//     serialPort.write(raw, (err) => {
//       if (err) {
//         console.error(`[SERIAL] Write error: ${err.message}`);
//         broadcastToClients({ type: 'ERROR', code: 'WRITE_FAIL', message: err.message });
//       }
//     });

//     const delay = COMMAND_DELAYS[command] ?? COMMAND_DELAY_DEFAULT;
//     await new Promise((res) => setTimeout(res, delay));
//   }

//   processingQueue = false;
// }

// // ========== WEBSOCKET SERVER ==========
// const wss = new WebSocketServer({ port: WS_PORT });

// wss.on('listening', () => {
//   console.log(`[WS] WebSocket server running on ws://localhost:${WS_PORT}`);
// });

// wss.on('connection', (ws) => {
//   wsClients.add(ws);
//   console.log(`[WS] Client connected (total: ${wsClients.size})`);

//   ws.send(JSON.stringify({
//     type: 'SYSTEM',
//     message: simulationMode ? 'Connected (simulation mode)' : 'Connected to Arduino',
//     simulationMode,
//     isConnected,
//   }));

//   ws.on('message', (data) => {
//     try {
//       const msg = JSON.parse(data.toString());
//       const { command, params } = msg;
//       if (!command) {
//         ws.send(JSON.stringify({ type: 'ERROR', code: 'NO_CMD', message: 'Missing command field' }));
//         return;
//       }
//       sendToArduino(command.toUpperCase(), params || '');
//     } catch {
//       ws.send(JSON.stringify({ type: 'ERROR', code: 'PARSE', message: 'Invalid JSON' }));
//     }
//   });

//   ws.on('close', () => {
//     wsClients.delete(ws);
//     console.log(`[WS] Client disconnected (total: ${wsClients.size})`);
//   });
// });

// function broadcastToClients(data) {
//   const json = JSON.stringify(data);
//   for (const client of wsClients) {
//     if (client.readyState === 1) client.send(json);
//   }
// }

// // ========== STARTUP ==========
// console.log('');
// console.log('╔══════════════════════════════════════════╗');
// console.log('║    AutoShop Serial Bridge Server v2.2    ║');
// console.log('╠══════════════════════════════════════════╣');
// console.log(`║  Serial: ${SERIAL_PATH.padEnd(30)}║`);
// console.log(`║  Baud:   ${String(SERIAL_BAUD).padEnd(30)}║`);
// console.log(`║  WS:     ws://localhost:${String(WS_PORT).padEnd(19)}║`);
// console.log('╚══════════════════════════════════════════╝');
// console.log('');

// connectSerial();

// // ========== GRACEFUL SHUTDOWN ==========
// process.on('SIGINT', () => {
//   console.log('\n[SHUTDOWN] Cleaning up...');
//   if (isConnected && serialPort) {
//     serialPort.write('ESTOP\n');
//     setTimeout(() => {
//       serialPort.close();
//       process.exit(0);
//     }, 500);
//   } else {
//     process.exit(0);
//   }
// });


































// #!/usr/bin/env node
// /**
//  * AutoShop Serial Bridge Server v2.1
//  * Bridges Arduino (USB Serial) ↔ Web App (WebSocket)
//  * Fully synchronized LED commands for PX, L, TX etc.
//  */
// // working 1000%
// const { SerialPort } = require('serialport');
// const { ReadlineParser } = require('@serialport/parser-readline');
// const { WebSocketServer } = require('ws');

// // ========== CONFIGURATION ==========
// const SERIAL_PATH = process.argv[2] || '/dev/ttyACM0';
// const SERIAL_BAUD = parseInt(process.argv[3]) || 9600;
// const WS_PORT = 8765;
// const RECONNECT_INTERVAL = 3000;

// // ================= FIXED DELAY =================
// // OLD: 50
// // NEW: wait long enough for servo shelf() routine to finish
// const COMMAND_DELAY = 12000;

// // ========== STATE ==========
// let serialPort = null;
// let parser = null;
// let wsClients = new Set();
// let isConnected = false;
// let simulationMode = false;
// let commandQueue = [];
// let processingQueue = false;

// // ========== SERIAL CONNECTION ==========
// function connectSerial() {

//   console.log(`[SERIAL] Connecting to ${SERIAL_PATH} at ${SERIAL_BAUD} baud...`);

//   try {

//     serialPort = new SerialPort({
//       path: SERIAL_PATH,
//       baudRate: SERIAL_BAUD,
//       autoOpen: false,
//     });

//     parser = serialPort.pipe(
//       new ReadlineParser({ delimiter: '\n' })
//     );

//     serialPort.open((err) => {

//       if (err) {
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

// }void shelf(){                              //this is for the shelve
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
//         console.error(`[SERIAL] Failed to open: ${err.message}`);

//         console.log('[SERIAL] Falling back to SIMULATION MODE');

//         simulationMode = true;

//         broadcastToClients({
//           type: 'SYSTEM',
//           message: 'Arduino not found - simulation mode active'
//         });

//         return;
//       }

//       isConnected = true;
//       simulationMode = false;

//       console.log(`[SERIAL] Connected to ${SERIAL_PATH}`);

//       broadcastToClients({
//         type: 'SYSTEM',
//         message: 'Arduino connected'
//       });

//       processQueue();
//     });void shelf(){                              //this is for the shelve
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

// }void shelf(){                              //this is for the shelve
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

// }void shelf(){                              //this is for the shelve
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

//     parser.on('data', (line) => {

//       const trimmed = line.trim();

//       if (!trimmed) return;

//       console.log(`[ARDUINO → WS] ${trimmed}`);

//       const parsed = parseArduinoResponse(trimmed);

//       broadcastToClients(parsed);
//     });

//     serialPort.on('error', (err) => {

//       console.error(`[SERIAL] Error: ${err.message}`);

//       isConnected = false;
//     });

//     serialPort.on('close', () => {

//       console.log('[SERIAL] Connection closed');

//       isConnected = false;

//       setTimeout(connectSerial, RECONNECT_INTERVAL);
//     });void shelf(){                              //this is for the shelve
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

// }void shelf(){                              //this is for the shelve
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

//   } catch (err) {

//     console.error(`[SERIAL] Exception: ${err.message}`);

//     simulationMode = true;
//   }
// }

// // ========== PARSE ARDUINO RESPONSES ==========
// function parseArduinoResponse(line) {

//   const parts = line.split(':');

//   const type = parts[0];

//   switch (type) {

//     case 'ACK':
//       return {
//         type: 'ACK',
//         command: parts[1] || '',
//         data: parts.slice(2).join(':')
//       };

//     case 'DONE':
//       return {
//         type: 'DONE',
//         command: parts[1] || '',
//         data: parts.slice(2).join(':')
//       };

//     case 'STATUS':
//       return {
//         type: 'STATUS',
//         state: parts[1] || '',
//         details: parts.slice(2).join(':')
//       };

//     case 'ERROR':
//       return {
//         type: 'ERROR',
//         code: parts[1] || '',
//         message: parts.slice(2).join(':')
//       };

//     case 'LOG':
//       return {
//         type: 'LOG',
//         message: parts.slice(1).join(':')
//       };

//     default:
//       return {
//         type: 'RAW',
//         message: line
//       };
//   }
// }

// // ========== SIMULATION MODE ==========
// function simulateCommand(cmd, params) {

//   console.log(`[SIMULATION] ${cmd}:${params}`);

//   broadcastToClients({
//     type: 'ACK',
//     command: cmd,
//     data: params
//   });

//   setTimeout(() => {

//     broadcastToClients({
//       type: 'DONE',
//       command: cmd
//     });

//   }, 1000);
// }

// // ========== SEND TO ARDUINO WITH QUEUE ==========
// function sendToArduino(command, params) {

//   const fullCmd =
//     params && params !== ''
//       ? `${command}:${params}\n`
//       : `${command}\n`;

//   if (simulationMode) {

//     simulateCommand(command, params || '');

//     return;
//   }

//   if (!isConnected || !serialPort) {

//     broadcastToClients({
//       type: 'ERROR',
//       code: 'NO_CONNECTION',
//       message: 'Arduino not connected'
//     });

//     return;
//   }

//   // ================= QUEUE COMMAND =================
//   commandQueue.push(fullCmd);

//   if (!processingQueue) {
//     processQueue();
//   }
// }

// // ========== PROCESS QUEUE ==========
// async function processQueue() {

//   if (processingQueue) return;

//   processingQueue = true;

//   while (commandQueue.length > 0) {

//     const cmd = commandQueue.shift();

//     console.log(`[WS → ARDUINO] ${cmd.trim()}`);

//     serialPort.write(cmd, (err) => {

//       if (err) {

//         console.error(`[SERIAL] Write error: ${err.message}`);

//         broadcastToClients({
//           type: 'ERROR',
//           code: 'WRITE_FAIL',
//           message: err.message
//         });
//       }
//     });

//     // ================= WAIT FOR SERVO/ACTION =================
//     await new Promise(res =>
//       setTimeout(res, COMMAND_DELAY)
//     );
//   }

//   processingQueue = false;
// }

// // ========== WEBSOCKET SERVER ==========
// const wss = new WebSocketServer({ port: WS_PORT });

// wss.on('listening', () => {

//   console.log(`[WS] WebSocket server running on ws://localhost:${WS_PORT}`);
// });

// wss.on('connection', (ws) => {

//   wsClients.add(ws);

//   console.log(`[WS] Client connected (total: ${wsClients.size})`);

//   ws.send(JSON.stringify({
//     type: 'SYSTEM',
//     message: simulationMode
//       ? 'Connected (simulation mode)'
//       : 'Connected to Arduino',
//     simulationMode,
//     isConnected,
//   }));

//   ws.on('message', (data) => {

//     try {

//       const msg = JSON.parse(data.toString());

//       const { command, params } = msg;

//       if (!command) {

//         ws.send(JSON.stringify({
//           type: 'ERROR',
//           code: 'NO_CMD',
//           message: 'Missing command field'
//         }));

//         return;
//       }

//       sendToArduino(
//         command.toUpperCase(),
//         params || ''
//       );

//     } catch {

//       ws.send(JSON.stringify({
//         type: 'ERROR',
//         code: 'PARSE',
//         message: 'Invalid JSON'
//       }));
//     }
//   });

//   ws.on('close', () => {

//     wsClients.delete(ws);

//     console.log(`[WS] Client disconnected (total: ${wsClients.size})`);
//   });
// });

// // ========== BROADCAST ==========
// function broadcastToClients(data) {

//   const json = JSON.stringify(data);

//   for (const client of wsClients) {

//     if (client.readyState === 1) {

//       client.send(json);
//     }
//   }
// }

// // ========== STARTUP ==========
// console.log('');
// console.log('╔══════════════════════════════════════════╗');
// console.log('║    AutoShop Serial Bridge Server v2.1    ║');
// console.log('╠══════════════════════════════════════════╣');
// console.log(`║  Serial: ${SERIAL_PATH.padEnd(30)}║`);
// console.log(`║  Baud:   ${String(SERIAL_BAUD).padEnd(30)}║`);
// console.log(`║  WS:     ws://localhost:${String(WS_PORT).padEnd(19)}║`);
// console.log('╚══════════════════════════════════════════╝');
// console.log('');

// connectSerial();

// // ========== GRACEFUL SHUTDOWN ==========
// process.on('SIGINT', () => {

//   console.log('\n[SHUTDOWN] Cleaning up...');

//   if (isConnected && serialPort) {

//     serialPort.write('ESTOP\n');

//     setTimeout(() => {

//       serialPort.close();

//       process.exit(0);

//     }, 500);

//   } else {

//     process.exit(0);
//   }
// });






































// #!/usr/bin/env node
// /**
//  * AutoShop Serial Bridge Server v2.1
//  * Bridges Arduino (USB Serial) ↔ Web App (WebSocket)
//  * Fully synchronized LED commands for PX, L, TX etc.
//  */
// // working 100% only commented on looking for intrgrating ultrasonic
// const { SerialPort } = require('serialport');
// const { ReadlineParser } = require('@serialport/parser-readline');
// const { WebSocketServer } = require('ws');

// // ========== CONFIGURATION ==========
// const SERIAL_PATH = process.argv[2] || '/dev/ttyACM0';
// const SERIAL_BAUD = parseInt(process.argv[3]) || 9600;
// const WS_PORT = 8765;
// const RECONNECT_INTERVAL = 3000;
// const COMMAND_DELAY = 50; // ms between sending commands to Arduino

// // ========== STATE ==========
// let serialPort = null;
// let parser = null;
// let wsClients = new Set();
// let isConnected = false;
// let simulationMode = false;
// let commandQueue = [];
// let processingQueue = false;

// // ========== SERIAL CONNECTION ==========
// function connectSerial() {
//   console.log(`[SERIAL] Connecting to ${SERIAL_PATH} at ${SERIAL_BAUD} baud...`);

//   try {
//     serialPort = new SerialPort({
//       path: SERIAL_PATH,
//       baudRate: SERIAL_BAUD,
//       autoOpen: false,
//     });

//     parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

//     serialPort.open((err) => {
//       if (err) {
//         console.error(`[SERIAL] Failed to open: ${err.message}`);
//         console.log('[SERIAL] Falling back to SIMULATION MODE');
//         simulationMode = true;
//         broadcastToClients({ type: 'SYSTEM', message: 'Arduino not found - simulation mode active' });
//         return;
//       }

//       isConnected = true;
//       simulationMode = false;
//       console.log(`[SERIAL] Connected to ${SERIAL_PATH}`);
//       broadcastToClients({ type: 'SYSTEM', message: 'Arduino connected' });
//       processQueue(); // start processing any queued commands
//     });

//     parser.on('data', (line) => {
//       const trimmed = line.trim();
//       if (!trimmed) return;

//       console.log(`[ARDUINO → WS] ${trimmed}`);
//       const parsed = parseArduinoResponse(trimmed);
//       broadcastToClients(parsed);
//     });

//     serialPort.on('error', (err) => {
//       console.error(`[SERIAL] Error: ${err.message}`);
//       isConnected = false;
//     });

//     serialPort.on('close', () => {
//       console.log('[SERIAL] Connection closed');
//       isConnected = false;
//       setTimeout(connectSerial, RECONNECT_INTERVAL);
//     });

//   } catch (err) {
//     console.error(`[SERIAL] Exception: ${err.message}`);
//     simulationMode = true;
//   }
// }

// // ========== PARSE ARDUINO RESPONSES ==========
// function parseArduinoResponse(line) {
//   const parts = line.split(':');
//   const type = parts[0];

//   switch (type) {
//     case 'ACK':
//       return { type: 'ACK', command: parts[1] || '', data: parts.slice(2).join(':') };
//     case 'DONE':
//       return { type: 'DONE', command: parts[1] || '', data: parts.slice(2).join(':') };
//     case 'STATUS':
//       return { type: 'STATUS', state: parts[1] || '', details: parts.slice(2).join(':') };
//     case 'ERROR':
//       return { type: 'ERROR', code: parts[1] || '', message: parts.slice(2).join(':') };
//     case 'LOG':
//       return { type: 'LOG', message: parts.slice(1).join(':') };
//     default:
//       return { type: 'RAW', message: line };
//   }
// }

// // ========== SIMULATION MODE ==========
// function simulateCommand(cmd, params) {
//   console.log(`[SIMULATION] ${cmd}:${params}`);
//   broadcastToClients({ type: 'ACK', command: cmd, data: params });

//   setTimeout(() => {
//     broadcastToClients({ type: 'DONE', command: cmd });
//   }, 1000);
// }

// // ========== SEND TO ARDUINO WITH QUEUE ==========
// function sendToArduino(command, params) {
//   const fullCmd = params && params !== '' ? `${command}:${params}\n` : `${command}\n`;

//   if (simulationMode) {
//     simulateCommand(command, params || '');
//     return;
//   }

//   if (!isConnected || !serialPort) {
//     broadcastToClients({
//       type: 'ERROR',
//       code: 'NO_CONNECTION',
//       message: 'Arduino not connected'
//     });
//     return;
//   }

//   // Queue commands to prevent simultaneous fast firing
//   commandQueue.push(fullCmd);
//   if (!processingQueue) processQueue();
// }

// async function processQueue() {
//   if (processingQueue) return;
//   processingQueue = true;

//   while (commandQueue.length > 0) {
//     const cmd = commandQueue.shift();
//     console.log(`[WS → ARDUINO] ${cmd.trim()}`);

//     serialPort.write(cmd, (err) => {
//       if (err) {
//         console.error(`[SERIAL] Write error: ${err.message}`);
//         broadcastToClients({
//           type: 'ERROR',
//           code: 'WRITE_FAIL',
//           message: err.message
//         });
//       }
//     });

//     // Wait a short delay so Arduino can handle LED blink properly
//     await new Promise(res => setTimeout(res, COMMAND_DELAY));
//   }

//   processingQueue = false;
// }

// // ========== WEBSOCKET SERVER ==========
// const wss = new WebSocketServer({ port: WS_PORT });

// wss.on('listening', () => {
//   console.log(`[WS] WebSocket server running on ws://localhost:${WS_PORT}`);
// });

// wss.on('connection', (ws) => {
//   wsClients.add(ws);
//   console.log(`[WS] Client connected (total: ${wsClients.size})`);

//   ws.send(JSON.stringify({
//     type: 'SYSTEM',
//     message: simulationMode ? 'Connected (simulation mode)' : 'Connected to Arduino',
//     simulationMode,
//     isConnected,
//   }));

//   ws.on('message', (data) => {
//     try {
//       const msg = JSON.parse(data.toString());
//       const { command, params } = msg;

//       if (!command) {
//         ws.send(JSON.stringify({
//           type: 'ERROR',
//           code: 'NO_CMD',
//           message: 'Missing command field'
//         }));
//         return;
//       }

//       sendToArduino(command.toUpperCase(), params || '');

//     } catch {
//       ws.send(JSON.stringify({
//         type: 'ERROR',
//         code: 'PARSE',
//         message: 'Invalid JSON'
//       }));
//     }
//   });

//   ws.on('close', () => {
//     wsClients.delete(ws);
//     console.log(`[WS] Client disconnected (total: ${wsClients.size})`);
//   });
// });

// function broadcastToClients(data) {
//   const json = JSON.stringify(data);
//   for (const client of wsClients) {
//     if (client.readyState === 1) {
//       client.send(json);
//     }
//   }
// }

// // ========== STARTUP ==========
// console.log('');
// console.log('╔══════════════════════════════════════════╗');
// console.log('║    AutoShop Serial Bridge Server v2.1    ║');
// console.log('╠══════════════════════════════════════════╣');
// console.log(`║  Serial: ${SERIAL_PATH.padEnd(30)}║`);
// console.log(`║  Baud:   ${String(SERIAL_BAUD).padEnd(30)}║`);
// console.log(`║  WS:     ws://localhost:${String(WS_PORT).padEnd(19)}║`);
// console.log('╚══════════════════════════════════════════╝');
// console.log('');

// connectSerial();

// // ========== GRACEFUL SHUTDOWN ==========
// process.on('SIGINT', () => {
//   console.log('\n[SHUTDOWN] Cleaning up...');

//   if (isConnected && serialPort) {
//     serialPort.write('ESTOP\n');
//     setTimeout(() => {
//       serialPort.close();
//       process.exit(0);
//     }, 500);
//   } else {
//     process.exit(0);
//   }
// });











































// #!/usr/bin/env node
// /**
//  * better than better 
//  * AutoShop Serial Bridge Server
//  * Bridges Arduino (USB Serial) ↔ Web App (WebSocket)
//  */

// const { SerialPort } = require('serialport');
// const { ReadlineParser } = require('@serialport/parser-readline');
// const { WebSocketServer } = require('ws');

// // ========== CONFIGURATION ==========
// const SERIAL_PATH = process.argv[2] || '/dev/ttyACM0';
// const SERIAL_BAUD = parseInt(process.argv[3]) || 9600;
// const WS_PORT = 8765;
// const RECONNECT_INTERVAL = 3000;

// // ========== STATE ==========
// let serialPort = null;
// let parser = null;
// let wsClients = new Set();
// let isConnected = false;
// let simulationMode = false;

// // ========== SERIAL CONNECTION ==========
// function connectSerial() {
//   console.log(`[SERIAL] Connecting to ${SERIAL_PATH} at ${SERIAL_BAUD} baud...`);

//   try {
//     serialPort = new SerialPort({
//       path: SERIAL_PATH,
//       baudRate: SERIAL_BAUD,
//       autoOpen: false,
//     });

//     parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

//     serialPort.open((err) => {
//       if (err) {
//         console.error(`[SERIAL] Failed to open: ${err.message}`);
//         console.log('[SERIAL] Falling back to SIMULATION MODE');
//         simulationMode = true;
//         broadcastToClients({ type: 'SYSTEM', message: 'Arduino not found - simulation mode active' });
//         return;
//       }

//       isConnected = true;
//       simulationMode = false;
//       console.log(`[SERIAL] Connected to ${SERIAL_PATH}`);
//       broadcastToClients({ type: 'SYSTEM', message: 'Arduino connected' });
//     });

//     parser.on('data', (line) => {
//       const trimmed = line.trim();
//       if (!trimmed) return;

//       console.log(`[ARDUINO → WS] ${trimmed}`);
//       const parsed = parseArduinoResponse(trimmed);
//       broadcastToClients(parsed);
//     });

//     serialPort.on('error', (err) => {
//       console.error(`[SERIAL] Error: ${err.message}`);
//       isConnected = false;
//     });

//     serialPort.on('close', () => {
//       console.log('[SERIAL] Connection closed');
//       isConnected = false;
//       setTimeout(connectSerial, RECONNECT_INTERVAL);
//     });

//   } catch (err) {
//     console.error(`[SERIAL] Exception: ${err.message}`);
//     simulationMode = true;
//   }
// }

// // ========== PARSE ARDUINO RESPONSES ==========
// function parseArduinoResponse(line) {
//   const parts = line.split(':');
//   const type = parts[0];

//   switch (type) {
//     case 'ACK':
//       return { type: 'ACK', command: parts[1] || '', data: parts.slice(2).join(':') };
//     case 'DONE':
//       return { type: 'DONE', command: parts[1] || '', data: parts.slice(2).join(':') };
//     case 'STATUS':
//       return { type: 'STATUS', state: parts[1] || '', details: parts.slice(2).join(':') };
//     case 'ERROR':
//       return { type: 'ERROR', code: parts[1] || '', message: parts.slice(2).join(':') };
//     case 'LOG':
//       return { type: 'LOG', message: parts.slice(1).join(':') };
//     default:
//       return { type: 'RAW', message: line };
//   }
// }

// // ========== SIMULATION MODE ==========
// function simulateCommand(cmd, params) {
//   console.log(`[SIMULATION] ${cmd}:${params}`);
//   broadcastToClients({ type: 'ACK', command: cmd, data: params });

//   setTimeout(() => {
//     broadcastToClients({ type: 'DONE', command: cmd });
//   }, 1000);
// }

// // ========== SEND TO ARDUINO ==========
// function sendToArduino(command, params) {

//   // ALWAYS append newline
//   const fullCmd = params && params !== ''
//     ? `${command}:${params}\n`
//     : `${command}\n`;

//   if (simulationMode) {
//     simulateCommand(command, params || '');
//     return;
//   }

//   if (!isConnected || !serialPort) {
//     broadcastToClients({
//       type: 'ERROR',
//       code: 'NO_CONNECTION',
//       message: 'Arduino not connected'
//     });
//     return;
//   }

//   console.log(`[WS → ARDUINO] ${fullCmd.trim()}`);

//   serialPort.write(fullCmd, (err) => {
//     if (err) {
//       console.error(`[SERIAL] Write error: ${err.message}`);
//       broadcastToClients({
//         type: 'ERROR',
//         code: 'WRITE_FAIL',
//         message: err.message
//       });
//     }
//   });
// }

// // ========== WEBSOCKET SERVER ==========
// const wss = new WebSocketServer({ port: WS_PORT });

// wss.on('listening', () => {
//   console.log(`[WS] WebSocket server running on ws://localhost:${WS_PORT}`);
// });

// wss.on('connection', (ws) => {
//   wsClients.add(ws);
//   console.log(`[WS] Client connected (total: ${wsClients.size})`);

//   ws.send(JSON.stringify({
//     type: 'SYSTEM',
//     message: simulationMode ? 'Connected (simulation mode)' : 'Connected to Arduino',
//     simulationMode,
//     isConnected,
//   }));

//   ws.on('message', (data) => {
//     try {
//       const msg = JSON.parse(data.toString());
//       const { command, params } = msg;

//       if (!command) {
//         ws.send(JSON.stringify({
//           type: 'ERROR',
//           code: 'NO_CMD',
//           message: 'Missing command field'
//         }));
//         return;
//       }

//       sendToArduino(command.toUpperCase(), params || '');

//     } catch {
//       ws.send(JSON.stringify({
//         type: 'ERROR',
//         code: 'PARSE',
//         message: 'Invalid JSON'
//       }));
//     }
//   });

//   ws.on('close', () => {
//     wsClients.delete(ws);
//     console.log(`[WS] Client disconnected (total: ${wsClients.size})`);
//   });
// });

// function broadcastToClients(data) {
//   const json = JSON.stringify(data);
//   for (const client of wsClients) {
//     if (client.readyState === 1) {
//       client.send(json);
//     }
//   }
// }

// // ========== STARTUP ==========
// console.log('');
// console.log('╔══════════════════════════════════════════╗');
// console.log('║    AutoShop Serial Bridge Server v2.0    ║');
// console.log('╠══════════════════════════════════════════╣');
// console.log(`║  Serial: ${SERIAL_PATH.padEnd(30)}║`);
// console.log(`║  Baud:   ${String(SERIAL_BAUD).padEnd(30)}║`);
// console.log(`║  WS:     ws://localhost:${String(WS_PORT).padEnd(19)}║`);
// console.log('╚══════════════════════════════════════════╝');
// console.log('');

// connectSerial();

// // ========== GRACEFUL SHUTDOWN ==========
// process.on('SIGINT', () => {
//   console.log('\n[SHUTDOWN] Cleaning up...');

//   if (isConnected && serialPort) {
//     serialPort.write('ESTOP\n');
//     setTimeout(() => {
//       serialPort.close();
//       process.exit(0);
//     }, 500);
//   } else {
//     process.exit(0);
//   }
// });





































// #!/usr/bin/env node
// /**
// better than all 
//  * AutoShop Serial Bridge Server
//  * ==============================
//  * 
//  * Bridges Arduino (USB Serial) ↔ Web App (WebSocket)
//  * 
//  * USAGE:
//  *   npm install serialport ws
//  *   node serial-bridge.js [PORT] [BAUD]
//  *   
//  *   Example: node serial-bridge.js /dev/ttyACM0 9600
//  *   Windows:  node serial-bridge.js COM3 9600
//  * 
//  * The bridge:
//  *   1. Opens serial connection to Arduino
//  *   2. Starts WebSocket server on port 8765
//  *   3. Forwards commands from WebSocket → Arduino
//  *   4. Forwards responses from Arduino → WebSocket
//  * 
//  * WEB APP connects to ws://localhost:8765 and sends JSON:
//  *   { "command": "PICK", "params": "3" }
//  *   → Sends "PICK:3\n" to Arduino
//  * 
//  * Arduino responses forwarded as JSON:
//  *   { "type": "ACK", "command": "PICK", "data": "3" }
//  *   { "type": "DONE", "command": "PICK" }
//  *   { "type": "LOG", "message": "Picking 3 item(s)..." }
//  */

// const { SerialPort } = require('serialport');
// const { ReadlineParser } = require('@serialport/parser-readline');
// const { WebSocketServer } = require('ws');

// // ========== CONFIGURATION ==========
// const SERIAL_PATH = process.argv[2] || '/dev/ttyACM0';
// const SERIAL_BAUD = parseInt(process.argv[3]) || 9600;
// const WS_PORT = 8765;
// const RECONNECT_INTERVAL = 3000;

// // ========== STATE ==========
// let serialPort = null;
// let parser = null;
// let wsClients = new Set();
// let isConnected = false;
// let simulationMode = false;

// // ========== SERIAL CONNECTION ==========
// function connectSerial() {
//   console.log(`[SERIAL] Connecting to ${SERIAL_PATH} at ${SERIAL_BAUD} baud...`);
  
//   try {
//     serialPort = new SerialPort({
//       path: SERIAL_PATH,
//       baudRate: SERIAL_BAUD,
//       autoOpen: false,
//     });

//     parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

//     serialPort.open((err) => {
//       if (err) {
//         console.error(`[SERIAL] Failed to open: ${err.message}`);
//         console.log('[SERIAL] Falling back to SIMULATION MODE');
//         simulationMode = true;
//         broadcastToClients({ type: 'SYSTEM', message: 'Arduino not found - simulation mode active' });
//         return;
//       }
      
//       isConnected = true;
//       simulationMode = false;
//       console.log(`[SERIAL] Connected to ${SERIAL_PATH}`);
//       broadcastToClients({ type: 'SYSTEM', message: 'Arduino connected' });
//     });

//     // Handle incoming data from Arduino
//     parser.on('data', (line) => {
//       const trimmed = line.trim();
//       if (!trimmed) return;
      
//       console.log(`[ARDUINO → WS] ${trimmed}`);
      
//       const parsed = parseArduinoResponse(trimmed);
//       broadcastToClients(parsed);
//     });

//     serialPort.on('error', (err) => {
//       console.error(`[SERIAL] Error: ${err.message}`);
//       isConnected = false;
//     });

//     serialPort.on('close', () => {
//       console.log('[SERIAL] Connection closed');
//       isConnected = false;
//       // Auto-reconnect
//       setTimeout(connectSerial, RECONNECT_INTERVAL);
//     });

//   } catch (err) {
//     console.error(`[SERIAL] Exception: ${err.message}`);
//     simulationMode = true;
//     console.log('[SERIAL] Falling back to SIMULATION MODE');
//   }
// }

// // ========== PARSE ARDUINO RESPONSES ==========
// function parseArduinoResponse(line) {
//   const parts = line.split(':');
//   const type = parts[0];
  
//   switch (type) {
//     case 'ACK':
//       return { type: 'ACK', command: parts[1] || '', data: parts.slice(2).join(':') };
//     case 'DONE':
//       return { type: 'DONE', command: parts[1] || '', data: parts.slice(2).join(':') };
//     case 'STATUS':
//       return { type: 'STATUS', state: parts[1] || '', details: parts.slice(2).join(':') };
//     case 'ERROR':
//       return { type: 'ERROR', code: parts[1] || '', message: parts.slice(2).join(':') };
//     case 'LOG':
//       return { type: 'LOG', message: parts.slice(1).join(':') };
//     default:
//       return { type: 'RAW', message: line };
//   }
// }

// // ========== SIMULATION MODE ==========
// function simulateCommand(cmd, params) {
//   console.log(`[SIMULATION] Command: ${cmd}:${params}`);
  
//   broadcastToClients({ type: 'ACK', command: cmd, data: params });
//   broadcastToClients({ type: 'LOG', message: `[SIM] Executing ${cmd} with params: ${params}` });
  
//   const count = parseInt(params) || 1;
//   let delay = 0;
  
//   switch (cmd) {
//     case 'PICK':
//       delay = count * 300; // 150ms on + 150ms off per blink
//       for (let i = 1; i <= count; i++) {
//         setTimeout(() => {
//           broadcastToClients({ type: 'LOG', message: `[SIM] LED blink ${i}/${count} - picking item ${i}` });
//         }, i * 300);
//       }
//       break;
//     case 'PACK':
//       delay = count * 600; // 300ms on + 300ms off per blink
//       for (let i = 1; i <= count; i++) {
//         setTimeout(() => {
//           broadcastToClients({ type: 'LOG', message: `[SIM] LED blink ${i}/${count} - packing item ${i}` });
//         }, i * 600);
//       }
//       break;
//     case 'CONVEYOR':
//       if (params === 'START') {
//         broadcastToClients({ type: 'LOG', message: '[SIM] Conveyor LED pulsing continuously...' });
//         return; // No DONE for conveyor start
//       }
//       delay = 0;
//       break;
//     case 'DELIVER':
//       delay = 3600; // 3 × (800+400)
//       break;
//     case 'COLLECT':
//       delay = count * 1200; // 600ms on + 600ms off
//       break;
//     case 'STATUS':
//       broadcastToClients({ type: 'STATUS', state: 'IDLE', details: 'simulation_mode=true' });
//       return;
//     case 'ESTOP':
//       broadcastToClients({ type: 'LOG', message: '[SIM] !!! EMERGENCY STOP !!!' });
//       broadcastToClients({ type: 'STATUS', state: 'ESTOP', details: 'All operations halted' });
//       return;
//     case 'RESET':
//       broadcastToClients({ type: 'STATUS', state: 'IDLE', details: 'System reset' });
//       broadcastToClients({ type: 'DONE', command: 'RESET' });
//       return;
//     default:
//       delay = 500;
//   }
  
//   setTimeout(() => {
//     broadcastToClients({ type: 'DONE', command: cmd });
//     broadcastToClients({ type: 'LOG', message: `[SIM] ${cmd} complete` });
//   }, delay);
// }

// // ========== SEND TO ARDUINO ==========
// function sendToArduino(command, params) {
//   const fullCmd = params ? `${command}:${params}\n` : `${command}\n`;
  
//   if (simulationMode) {
//     simulateCommand(command, params || '');
//     return;
//   }
  
//   if (!isConnected || !serialPort) {
//     broadcastToClients({ type: 'ERROR', code: 'NO_CONNECTION', message: 'Arduino not connected' });
//     return;
//   }
  
//   console.log(`[WS → ARDUINO] ${fullCmd.trim()}`);
//   serialPort.write(fullCmd, (err) => {
//     if (err) {
//       console.error(`[SERIAL] Write error: ${err.message}`);
//       broadcastToClients({ type: 'ERROR', code: 'WRITE_FAIL', message: err.message });
//     }
//   });
// }

// // ========== WEBSOCKET SERVER ==========
// const wss = new WebSocketServer({ port: WS_PORT });

// wss.on('listening', () => {
//   console.log(`[WS] WebSocket server running on ws://localhost:${WS_PORT}`);
// });

// wss.on('connection', (ws) => {
//   wsClients.add(ws);
//   console.log(`[WS] Client connected (total: ${wsClients.size})`);
  
//   // Send current status to new client
//   ws.send(JSON.stringify({
//     type: 'SYSTEM',
//     message: simulationMode ? 'Connected (simulation mode)' : 'Connected to Arduino',
//     simulationMode,
//     isConnected,
//   }));
  
//   ws.on('message', (data) => {
//     try {
//       const msg = JSON.parse(data.toString());
//       const { command, params } = msg;
      
//       if (!command) {
//         ws.send(JSON.stringify({ type: 'ERROR', code: 'NO_CMD', message: 'Missing command field' }));
//         return;
//       }
      
//       sendToArduino(command.toUpperCase(), params || '');
      
//     } catch (err) {
//       ws.send(JSON.stringify({ type: 'ERROR', code: 'PARSE', message: 'Invalid JSON' }));
//     }
//   });
  
//   ws.on('close', () => {
//     wsClients.delete(ws);
//     console.log(`[WS] Client disconnected (total: ${wsClients.size})`);
//   });
// });

// function broadcastToClients(data) {
//   const json = JSON.stringify(data);
//   for (const client of wsClients) {
//     if (client.readyState === 1) { // OPEN
//       client.send(json);
//     }
//   }
// }

// // ========== STARTUP ==========
// console.log('');
// console.log('╔══════════════════════════════════════════╗');
// console.log('║    AutoShop Serial Bridge Server v1.0    ║');
// console.log('╠══════════════════════════════════════════╣');
// console.log(`║  Serial: ${SERIAL_PATH.padEnd(30)}║`);
// console.log(`║  Baud:   ${String(SERIAL_BAUD).padEnd(30)}║`);
// console.log(`║  WS:     ws://localhost:${String(WS_PORT).padEnd(19)}║`);
// console.log('╚══════════════════════════════════════════╝');
// console.log('');

// connectSerial();

// // ========== GRACEFUL SHUTDOWN ==========
// process.on('SIGINT', () => {
//   console.log('\n[SHUTDOWN] Cleaning up...');
  
//   // Send ESTOP to Arduino on shutdown
//   if (isConnected && serialPort) {
//     serialPort.write('ESTOP\n');
//     setTimeout(() => {
//       serialPort.close();
//       process.exit(0);
//     }, 500);
//   } else {
//     process.exit(0);
//   }
// });































// #!/usr/bin/env node
// /**
//  * AutoShop Serial Bridge Server (QUEUED VERSION)
//  * ===============================================
//  * Deterministic command execution with DONE gating
//  */

// const { SerialPort } = require('serialport');
// const { ReadlineParser } = require('@serialport/parser-readline');
// const { WebSocketServer } = require('ws');

// // ========== CONFIGURATION ==========
// const SERIAL_PATH = process.argv[2] || '/dev/ttyACM0';
// const SERIAL_BAUD = parseInt(process.argv[3]) || 9600;
// const WS_PORT = 8765;
// const RECONNECT_INTERVAL = 3000;

// // ========== STATE ==========
// let serialPort = null;
// let parser = null;
// let wsClients = new Set();
// let isConnected = false;
// let simulationMode = false;

// // ===== QUEUE SYSTEM =====
// let commandQueue = [];
// let busy = false;
// let currentCommand = null;

// // ========== SERIAL CONNECTION ==========
// function connectSerial() {
//   console.log(`[SERIAL] Connecting to ${SERIAL_PATH} at ${SERIAL_BAUD} baud...`);

//   try {
//     serialPort = new SerialPort({
//       path: SERIAL_PATH,
//       baudRate: SERIAL_BAUD,
//       autoOpen: false,
//     });

//     parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

//     serialPort.open((err) => {
//       if (err) {
//         console.error(`[SERIAL] Failed to open: ${err.message}`);
//         console.log('[SERIAL] Falling back to SIMULATION MODE');
//         simulationMode = true;
//         broadcastToClients({ type: 'SYSTEM', message: 'Arduino not found - simulation mode active' });
//         return;
//       }

//       isConnected = true;
//       simulationMode = false;
//       console.log(`[SERIAL] Connected to ${SERIAL_PATH}`);
//       broadcastToClients({ type: 'SYSTEM', message: 'Arduino connected' });
//     });

//     parser.on('data', (line) => {
//       const trimmed = line.trim();
//       if (!trimmed) return;

//       console.log(`[ARDUINO → WS] ${trimmed}`);

//       const parsed = parseArduinoResponse(trimmed);
//       broadcastToClients(parsed);

//       // ===== DONE GATE =====
//       if (parsed.type === 'DONE') {
//         busy = false;
//         currentCommand = null;
//         processNextCommand();
//       }
//     });

//     serialPort.on('error', (err) => {
//       console.error(`[SERIAL] Error: ${err.message}`);
//       isConnected = false;
//     });

//     serialPort.on('close', () => {
//       console.log('[SERIAL] Connection closed');
//       isConnected = false;
//       setTimeout(connectSerial, RECONNECT_INTERVAL);
//     });

//   } catch (err) {
//     console.error(`[SERIAL] Exception: ${err.message}`);
//     simulationMode = true;
//     console.log('[SERIAL] Falling back to SIMULATION MODE');
//   }
// }

// // ========== PARSER ==========
// function parseArduinoResponse(line) {
//   const parts = line.split(':');
//   const type = parts[0];

//   switch (type) {
//     case 'ACK':
//       return { type: 'ACK', command: parts[1] || '', data: parts.slice(2).join(':') };
//     case 'DONE':
//       return { type: 'DONE', command: parts[1] || '', data: parts.slice(2).join(':') };
//     case 'STATUS':
//       return { type: 'STATUS', state: parts[1] || '', details: parts.slice(2).join(':') };
//     case 'ERROR':
//       return { type: 'ERROR', code: parts[1] || '', message: parts.slice(2).join(':') };
//     case 'LOG':
//       return { type: 'LOG', message: parts.slice(1).join(':') };
//     default:
//       return { type: 'RAW', message: line };
//   }
// }

// // ========== QUEUE SYSTEM ==========
// function enqueueCommand(command, params) {
//   commandQueue.push({ command, params });
//   processNextCommand();
// }

// function processNextCommand() {
//   if (busy) return;
//   if (commandQueue.length === 0) return;

//   const next = commandQueue.shift();
//   currentCommand = next.command;
//   busy = true;

//   sendToArduino(next.command, next.params);

//   // Conveyor START does not send DONE → auto-release
//   if (next.command === 'CONVEYOR' && next.params === 'START') {
//     setTimeout(() => {
//       busy = false;
//       currentCommand = null;
//       processNextCommand();
//     }, 100);
//   }
// }

// // ========== SIMULATION ==========
// function simulateCommand(cmd, params) {
//   broadcastToClients({ type: 'ACK', command: cmd, data: params });

//   let delay = 0;
//   const count = parseInt(params) || 1;

//   switch (cmd) {
//     case 'PICK': delay = count * 300; break;
//     case 'PACK': delay = count * 600; break;
//     case 'DELIVER': delay = 3600; break;
//     case 'COLLECT': delay = count * 1200; break;
//     case 'CONVEYOR':
//       if (params === 'START') return;
//       break;
//     default:
//       delay = 500;
//   }

//   setTimeout(() => {
//     broadcastToClients({ type: 'DONE', command: cmd });
//     busy = false;
//     currentCommand = null;
//     processNextCommand();
//   }, delay);
// }

// // ========== SEND TO ARDUINO ==========
// function sendToArduino(command, params) {
//   const fullCmd = params ? `${command}:${params}\n` : `${command}\n`;

//   if (simulationMode) {
//     simulateCommand(command, params || '');
//     return;
//   }

//   if (!isConnected || !serialPort) {
//     broadcastToClients({ type: 'ERROR', code: 'NO_CONNECTION', message: 'Arduino not connected' });
//     busy = false;
//     return;
//   }

//   console.log(`[WS → ARDUINO] ${fullCmd.trim()}`);

//   serialPort.write(fullCmd, (err) => {
//     if (err) {
//       console.error(`[SERIAL] Write error: ${err.message}`);
//       broadcastToClients({ type: 'ERROR', code: 'WRITE_FAIL', message: err.message });
//       busy = false;
//     }
//   });
// }

// // ========== WEBSOCKET ==========
// const wss = new WebSocketServer({ port: WS_PORT });

// wss.on('listening', () => {
//   console.log(`[WS] WebSocket server running on ws://localhost:${WS_PORT}`);
// });

// wss.on('connection', (ws) => {
//   wsClients.add(ws);
//   console.log(`[WS] Client connected (total: ${wsClients.size})`);

//   ws.send(JSON.stringify({
//     type: 'SYSTEM',
//     message: simulationMode ? 'Connected (simulation mode)' : 'Connected to Arduino',
//     simulationMode,
//     isConnected,
//   }));

//   ws.on('message', (data) => {
//     try {
//       const msg = JSON.parse(data.toString());
//       const { command, params } = msg;

//       if (!command) {
//         ws.send(JSON.stringify({ type: 'ERROR', code: 'NO_CMD', message: 'Missing command field' }));
//         return;
//       }

//       enqueueCommand(command.toUpperCase(), params || '');

//     } catch (err) {
//       ws.send(JSON.stringify({ type: 'ERROR', code: 'PARSE', message: 'Invalid JSON' }));
//     }
//   });

//   ws.on('close', () => {
//     wsClients.delete(ws);
//     console.log(`[WS] Client disconnected (total: ${wsClients.size})`);
//   });
// });

// function broadcastToClients(data) {
//   const json = JSON.stringify(data);
//   for (const client of wsClients) {
//     if (client.readyState === 1) {
//       client.send(json);
//     }
//   }
// }

// // ========== STARTUP ==========
// console.log('');
// console.log('╔══════════════════════════════════════════╗');
// console.log('║ AutoShop Serial Bridge Server v2.0      ║');
// console.log('╠══════════════════════════════════════════╣');
// console.log(`║ Serial: ${SERIAL_PATH.padEnd(30)}║`);
// console.log(`║ Baud:   ${String(SERIAL_BAUD).padEnd(30)}║`);
// console.log(`║ WS:     ws://localhost:${String(WS_PORT).padEnd(19)}║`);
// console.log('╚══════════════════════════════════════════╝');
// console.log('');

// connectSerial();

// // ========== SHUTDOWN ==========
// process.on('SIGINT', () => {
//   console.log('\n[SHUTDOWN] Cleaning up...');

//   if (isConnected && serialPort) {
//     serialPort.write('ESTOP\n');
//     setTimeout(() => {
//       serialPort.close();
//       process.exit(0);
//     }, 500);
//   } else {
//     process.exit(0);
//   }
// });













































// #!/usr/bin/env node
// /**
//  * AutoShop Serial Bridge Server
//  * ==============================
//  * 
//  * Bridges Arduino (USB Serial) ↔ Web App (WebSocket)
//  * 
//  * USAGE:
//  *   npm install serialport ws
//  *   node serial-bridge.js [PORT] [BAUD]
//  *   
//  *   Example: node serial-bridge.js /dev/ttyACM0 9600
//  *   Windows:  node serial-bridge.js COM3 9600
//  * 
//  * The bridge:
//  *   1. Opens serial connection to Arduino
//  *   2. Starts WebSocket server on port 8765
//  *   3. Forwards commands from WebSocket → Arduino
//  *   4. Forwards responses from Arduino → WebSocket
//  * 
//  * WEB APP connects to ws://localhost:8765 and sends JSON:
//  *   { "command": "PICK", "params": "3" }
//  *   → Sends "PICK:3\n" to Arduino
//  * 
//  * Arduino responses forwarded as JSON:
//  *   { "type": "ACK", "command": "PICK", "data": "3" }
//  *   { "type": "DONE", "command": "PICK" }
//  *   { "type": "LOG", "message": "Picking 3 item(s)..." }
//  */

// const { SerialPort } = require('serialport');
// const { ReadlineParser } = require('@serialport/parser-readline');
// const { WebSocketServer } = require('ws');

// // ========== CONFIGURATION ==========
// const SERIAL_PATH = process.argv[2] || '/dev/ttyACM0';
// const SERIAL_BAUD = parseInt(process.argv[3]) || 9600;
// const WS_PORT = 8765;
// const RECONNECT_INTERVAL = 3000;

// // ========== STATE ==========
// let serialPort = null;
// let parser = null;
// let wsClients = new Set();
// let isConnected = false;
// let simulationMode = false;

// // ========== SERIAL CONNECTION ==========
// function connectSerial() {
//   console.log(`[SERIAL] Connecting to ${SERIAL_PATH} at ${SERIAL_BAUD} baud...`);
  
//   try {
//     serialPort = new SerialPort({
//       path: SERIAL_PATH,
//       baudRate: SERIAL_BAUD,
//       autoOpen: false,
//     });

//     parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

//     serialPort.open((err) => {
//       if (err) {
//         console.error(`[SERIAL] Failed to open: ${err.message}`);
//         console.log('[SERIAL] Falling back to SIMULATION MODE');
//         simulationMode = true;
//         broadcastToClients({ type: 'SYSTEM', message: 'Arduino not found - simulation mode active' });
//         return;
//       }
      
//       isConnected = true;
//       simulationMode = false;
//       console.log(`[SERIAL] Connected to ${SERIAL_PATH}`);
//       broadcastToClients({ type: 'SYSTEM', message: 'Arduino connected' });
//     });

//     // Handle incoming data from Arduino
//     parser.on('data', (line) => {
//       const trimmed = line.trim();
//       if (!trimmed) return;
      
//       console.log(`[ARDUINO → WS] ${trimmed}`);
      
//       const parsed = parseArduinoResponse(trimmed);
//       broadcastToClients(parsed);
//     });

//     serialPort.on('error', (err) => {
//       console.error(`[SERIAL] Error: ${err.message}`);
//       isConnected = false;
//     });

//     serialPort.on('close', () => {
//       console.log('[SERIAL] Connection closed');
//       isConnected = false;
//       // Auto-reconnect
//       setTimeout(connectSerial, RECONNECT_INTERVAL);
//     });

//   } catch (err) {
//     console.error(`[SERIAL] Exception: ${err.message}`);
//     simulationMode = true;
//     console.log('[SERIAL] Falling back to SIMULATION MODE');
//   }
// }

// // ========== PARSE ARDUINO RESPONSES ==========
// function parseArduinoResponse(line) {
//   const parts = line.split(':');
//   const type = parts[0];
  
//   switch (type) {
//     case 'ACK':
//       return { type: 'ACK', command: parts[1] || '', data: parts.slice(2).join(':') };
//     case 'DONE':
//       return { type: 'DONE', command: parts[1] || '', data: parts.slice(2).join(':') };
//     case 'STATUS':
//       return { type: 'STATUS', state: parts[1] || '', details: parts.slice(2).join(':') };
//     case 'ERROR':
//       return { type: 'ERROR', code: parts[1] || '', message: parts.slice(2).join(':') };
//     case 'LOG':
//       return { type: 'LOG', message: parts.slice(1).join(':') };
//     default:
//       return { type: 'RAW', message: line };
//   }
// }

// // ========== SIMULATION MODE ==========
// function simulateCommand(cmd, params) {
//   console.log(`[SIMULATION] Command: ${cmd}:${params}`);
  
//   broadcastToClients({ type: 'ACK', command: cmd, data: params });
//   broadcastToClients({ type: 'LOG', message: `[SIM] Executing ${cmd} with params: ${params}` });
  
//   const count = parseInt(params) || 1;
//   let delay = 0;
  
//   switch (cmd) {
//     case 'PICK':
//       delay = count * 300; // 150ms on + 150ms off per blink
//       for (let i = 1; i <= count; i++) {
//         setTimeout(() => {
//           broadcastToClients({ type: 'LOG', message: `[SIM] LED blink ${i}/${count} - picking item ${i}` });
//         }, i * 300);
//       }
//       break;
//     case 'PACK':
//       delay = count * 600; // 300ms on + 300ms off per blink
//       for (let i = 1; i <= count; i++) {
//         setTimeout(() => {
//           broadcastToClients({ type: 'LOG', message: `[SIM] LED blink ${i}/${count} - packing item ${i}` });
//         }, i * 600);
//       }
//       break;
//     case 'CONVEYOR':
//       if (params === 'START') {
//         broadcastToClients({ type: 'LOG', message: '[SIM] Conveyor LED pulsing continuously...' });
//         return; // No DONE for conveyor start
//       }
//       delay = 0;
//       break;
//     case 'DELIVER':
//       delay = 3600; // 3 × (800+400)
//       break;
//     case 'COLLECT':
//       delay = count * 1200; // 600ms on + 600ms off
//       break;
//     case 'STATUS':
//       broadcastToClients({ type: 'STATUS', state: 'IDLE', details: 'simulation_mode=true' });
//       return;
//     case 'ESTOP':
//       broadcastToClients({ type: 'LOG', message: '[SIM] !!! EMERGENCY STOP !!!' });
//       broadcastToClients({ type: 'STATUS', state: 'ESTOP', details: 'All operations halted' });
//       return;
//     case 'RESET':
//       broadcastToClients({ type: 'STATUS', state: 'IDLE', details: 'System reset' });
//       broadcastToClients({ type: 'DONE', command: 'RESET' });
//       return;
//     default:
//       delay = 500;
//   }
  
//   setTimeout(() => {
//     broadcastToClients({ type: 'DONE', command: cmd });
//     broadcastToClients({ type: 'LOG', message: `[SIM] ${cmd} complete` });
//   }, delay);
// }

// // ========== SEND TO ARDUINO ==========
// function sendToArduino(command, params) {
//   const fullCmd = params ? `${command}:${params}\n` : `${command}\n`;
  
//   if (simulationMode) {
//     simulateCommand(command, params || '');
//     return;
//   }
  
//   if (!isConnected || !serialPort) {
//     broadcastToClients({ type: 'ERROR', code: 'NO_CONNECTION', message: 'Arduino not connected' });
//     return;
//   }
  
//   console.log(`[WS → ARDUINO] ${fullCmd.trim()}`);
//   serialPort.write(fullCmd, (err) => {
//     if (err) {
//       console.error(`[SERIAL] Write error: ${err.message}`);
//       broadcastToClients({ type: 'ERROR', code: 'WRITE_FAIL', message: err.message });
//     }
//   });
// }

// // ========== WEBSOCKET SERVER ==========
// const wss = new WebSocketServer({ port: WS_PORT });

// wss.on('listening', () => {
//   console.log(`[WS] WebSocket server running on ws://localhost:${WS_PORT}`);
// });

// wss.on('connection', (ws) => {
//   wsClients.add(ws);
//   console.log(`[WS] Client connected (total: ${wsClients.size})`);
  
//   // Send current status to new client
//   ws.send(JSON.stringify({
//     type: 'SYSTEM',
//     message: simulationMode ? 'Connected (simulation mode)' : 'Connected to Arduino',
//     simulationMode,
//     isConnected,
//   }));
  
//   ws.on('message', (data) => {
//     try {
//       const msg = JSON.parse(data.toString());
//       const { command, params } = msg;
      
//       if (!command) {
//         ws.send(JSON.stringify({ type: 'ERROR', code: 'NO_CMD', message: 'Missing command field' }));
//         return;
//       }
      
//       sendToArduino(command.toUpperCase(), params || '');
      
//     } catch (err) {
//       ws.send(JSON.stringify({ type: 'ERROR', code: 'PARSE', message: 'Invalid JSON' }));
//     }
//   });
  
//   ws.on('close', () => {
//     wsClients.delete(ws);
//     console.log(`[WS] Client disconnected (total: ${wsClients.size})`);
//   });
// });

// function broadcastToClients(data) {
//   const json = JSON.stringify(data);
//   for (const client of wsClients) {
//     if (client.readyState === 1) { // OPEN
//       client.send(json);
//     }
//   }
// }

// // ========== STARTUP ==========
// console.log('');
// console.log('╔══════════════════════════════════════════╗');
// console.log('║    AutoShop Serial Bridge Server v1.0    ║');
// console.log('╠══════════════════════════════════════════╣');
// console.log(`║  Serial: ${SERIAL_PATH.padEnd(30)}║`);
// console.log(`║  Baud:   ${String(SERIAL_BAUD).padEnd(30)}║`);
// console.log(`║  WS:     ws://localhost:${String(WS_PORT).padEnd(19)}║`);
// console.log('╚══════════════════════════════════════════╝');
// console.log('');

// connectSerial();

// // ========== GRACEFUL SHUTDOWN ==========
// process.on('SIGINT', () => {
//   console.log('\n[SHUTDOWN] Cleaning up...');
  
//   // Send ESTOP to Arduino on shutdown
//   if (isConnected && serialPort) {
//     serialPort.write('ESTOP\n');
//     setTimeout(() => {
//       serialPort.close();
//       process.exit(0);
//     }, 500);
//   } else {
//     process.exit(0);
//   }
// });



















































// #!/usr/bin/env node
// /**
//  * better
//  * AutoShop Serial Bridge Server v6.0
//  * ==============================
//  * Bridges Arduino (USB Serial) ↔ Web App (WebSocket)
//  * Implements proper command queue and waits for Arduino DONE.
//  */

// const { SerialPort } = require('serialport');
// const { ReadlineParser } = require('@serialport/parser-readline');
// const { WebSocketServer } = require('ws');

// // ========== CONFIG ==========
// const SERIAL_PATH = process.argv[2] || '/dev/ttyACM0';
// const SERIAL_BAUD = parseInt(process.argv[3]) || 9600;
// const WS_PORT = 8765;
// const RECONNECT_INTERVAL = 3000;

// // ========== STATE ==========
// let serialPort = null;
// let parser = null;
// let wsClients = new Set();
// let isConnected = false;
// let simulationMode = false;

// // Queue system
// let commandQueue = [];
// let processingCommand = null;

// // Commands that do not block the queue
// const NON_BLOCKING = ['CONVEYOR'];

// // ========== SERIAL CONNECTION ==========
// function connectSerial() {
//   console.log(`[SERIAL] Connecting to ${SERIAL_PATH} at ${SERIAL_BAUD} baud...`);
//   try {
//     serialPort = new SerialPort({ path: SERIAL_PATH, baudRate: SERIAL_BAUD, autoOpen: false });
//     parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

//     serialPort.open((err) => {
//       if (err) {
//         console.error(`[SERIAL] Failed to open: ${err.message}`);
//         simulationMode = true;
//         broadcastToClients({ type: 'SYSTEM', message: 'Arduino not found - simulation mode active' });
//         return;
//       }
//       isConnected = true;
//       simulationMode = false;
//       console.log(`[SERIAL] Connected to ${SERIAL_PATH}`);
//       broadcastToClients({ type: 'SYSTEM', message: 'Arduino connected' });
//       processQueue();
//     });

//     parser.on('data', handleSerialData);

//     serialPort.on('error', (err) => { console.error(`[SERIAL] Error: ${err.message}`); isConnected = false; });
//     serialPort.on('close', () => { console.log('[SERIAL] Connection closed'); isConnected = false; setTimeout(connectSerial, RECONNECT_INTERVAL); });

//   } catch (err) {
//     console.error(`[SERIAL] Exception: ${err.message}`);
//     simulationMode = true;
//     broadcastToClients({ type: 'SYSTEM', message: 'Simulation mode active due to serial error' });
//   }
// }

// // ========== PARSE ARDUINO ==========
// function parseArduinoResponse(line) {
//   const parts = line.split(':');
//   const type = parts[0];
//   switch (type) {
//     case 'ACK': return { type: 'ACK', command: parts[1] || '', data: parts.slice(2).join(':') };
//     case 'DONE': return { type: 'DONE', command: parts[1] || '', data: parts.slice(2).join(':') };
//     case 'STATUS': return { type: 'STATUS', state: parts[1] || '', details: parts.slice(2).join(':') };
//     case 'ERROR': return { type: 'ERROR', code: parts[1] || '', message: parts.slice(2).join(':') };
//     case 'LOG': return { type: 'LOG', message: parts.slice(1).join(':') };
//     default: return { type: 'RAW', message: line };
//   }
// }

// // ========== HANDLE SERIAL DATA ==========
// function handleSerialData(line) {
//   const trimmed = line.trim();
//   if (!trimmed) return;
//   console.log(`[ARDUINO → WS] ${trimmed}`);
//   const parsed = parseArduinoResponse(trimmed);
//   broadcastToClients(parsed);

//   if (parsed.type === 'DONE') {
//     // Only clear queue if DONE matches the processing command
//     if (processingCommand && processingCommand.command === parsed.command) {
//       processingCommand = null;
//       processQueue();
//     }
//   }
// }

// // ========== QUEUE PROCESSOR ==========
// function processQueue() {
//   if (processingCommand) return; // busy
//   if (commandQueue.length === 0) return;

//   const next = commandQueue.shift();
//   processingCommand = next;

//   if (simulationMode) {
//     simulateCommand(next.command, next.params);
//     return;
//   }

//   if (!isConnected || !serialPort) {
//     broadcastToClients({ type: 'ERROR', code: 'NO_CONNECTION', message: 'Arduino not connected' });
//     processingCommand = null;
//     processQueue();
//     return;
//   }

//   const fullCmd = next.params ? `${next.command}:${next.params}\n` : `${next.command}\n`;
//   console.log(`[QUEUE → ARDUINO] ${fullCmd.trim()}`);
//   serialPort.write(fullCmd, (err) => {
//     if (err) {
//       broadcastToClients({ type: 'ERROR', code: 'WRITE_FAIL', message: err.message });
//       processingCommand = null;
//       processQueue();
//     }
//   });
// }

// // ========== SEND COMMAND ==========
// function sendCommand(command, params) {
//   command = command.toUpperCase();

//   // Non-blocking commands bypass queue
//   if (NON_BLOCKING.includes(command)) {
//     const fullCmd = params ? `${command}:${params}\n` : `${command}\n`;
//     if (simulationMode) {
//       simulateCommand(command, params || '');
//     } else {
//       console.log(`[WS → ARDUINO] ${fullCmd.trim()}`);
//       serialPort.write(fullCmd);
//     }
//     return;
//   }

//   commandQueue.push({ command, params });
//   processQueue();
// }

// // ========== SIMULATION ==========
// function simulateCommand(cmd, params) {
//   console.log(`[SIMULATION] Command: ${cmd}:${params}`);
//   broadcastToClients({ type: 'ACK', command: cmd, data: params });
//   broadcastToClients({ type: 'LOG', message: `[SIM] Executing ${cmd} with params: ${params}` });

//   const count = parseInt(params) || 1;
//   let delay = 500;

//   switch (cmd) {
//     case 'PICK': delay = count * 300; break;
//     case 'PACK': delay = count * 600; break;
//     case 'CONVEYOR':
//       if (params === 'START') { broadcastToClients({ type: 'LOG', message: '[SIM] Conveyor running...' }); return; }
//       delay = 0; break;
//     case 'DELIVER': delay = 3600; break;
//     case 'COLLECT': delay = count * 1200; break;
//     case 'STATUS':
//       broadcastToClients({ type: 'STATUS', state: 'IDLE', details: 'simulation_mode=true' });
//       return;
//     case 'ESTOP':
//       broadcastToClients({ type: 'LOG', message: '[SIM] !!! EMERGENCY STOP !!!' });
//       broadcastToClients({ type: 'STATUS', state: 'ESTOP', details: 'All operations halted' });
//       return;
//     case 'RESET':
//       broadcastToClients({ type: 'STATUS', state: 'IDLE', details: 'System reset' });
//       broadcastToClients({ type: 'DONE', command: 'RESET' });
//       return;
//   }

//   let completed = 0;
//   for (let i = 1; i <= count; i++) {
//     setTimeout(() => {
//       broadcastToClients({ type: 'LOG', message: `[SIM] LED blink ${i}/${count} - ${cmd}` });
//       completed++;
//       if (completed === count) broadcastToClients({ type: 'DONE', command: cmd });
//     }, i * (delay / count));
//   }
// }

// // ========== WEBSOCKET ==========
// const wss = new WebSocketServer({ port: WS_PORT });
// wss.on('listening', () => console.log(`[WS] WebSocket server running on ws://localhost:${WS_PORT}`));

// wss.on('connection', (ws) => {
//   wsClients.add(ws);
//   console.log(`[WS] Client connected (total: ${wsClients.size})`);

//   ws.send(JSON.stringify({
//     type: 'SYSTEM',
//     message: simulationMode ? 'Connected (simulation mode)' : 'Connected to Arduino',
//     simulationMode,
//     isConnected,
//   }));

//   ws.on('message', (data) => {
//     try {
//       const msg = JSON.parse(data.toString());
//       const { command, params } = msg;
//       if (!command) return ws.send(JSON.stringify({ type: 'ERROR', code: 'NO_CMD', message: 'Missing command field' }));
//       sendCommand(command, params || '');
//     } catch {
//       ws.send(JSON.stringify({ type: 'ERROR', code: 'PARSE', message: 'Invalid JSON' }));
//     }
//   });

//   ws.on('close', () => { wsClients.delete(ws); console.log(`[WS] Client disconnected (total: ${wsClients.size})`); });
// });

// // ========== BROADCAST ==========
// function broadcastToClients(data) {
//   const json = JSON.stringify(data);
//   for (const client of wsClients) if (client.readyState === 1) client.send(json);
// }

// // ========== STARTUP ==========
// console.log('');
// console.log('╔══════════════════════════════════════════╗');
// console.log('║    AutoShop Serial Bridge Server v6.0    ║');
// console.log('╠══════════════════════════════════════════╣');
// console.log(`║  Serial: ${SERIAL_PATH.padEnd(30)}║`);
// console.log(`║  Baud:   ${String(SERIAL_BAUD).padEnd(30)}║`);
// console.log(`║  WS:     ws://localhost:${String(WS_PORT).padEnd(19)}║`);
// console.log('╚══════════════════════════════════════════╝\n');

// connectSerial();

// // ========== GRACEFUL SHUTDOWN ==========
// process.on('SIGINT', () => {
//   console.log('\n[SHUTDOWN] Cleaning up...');
//   if (isConnected && serialPort) serialPort.write('ESTOP\n');
//   setTimeout(() => serialPort?.close(), 500);
//   setTimeout(() => process.exit(0), 1000);
// });


































// #!/usr/bin/env node
// /**
//  * AutoShop Serial Bridge Server v5.0
//  * ==============================
//  * Bridges Arduino ↔ WebSocket with proper command queue
//  */

// const { SerialPort } = require('serialport');
// const { ReadlineParser } = require('@serialport/parser-readline');
// const { WebSocketServer } = require('ws');

// // ========== CONFIG ==========
// const SERIAL_PATH = process.argv[2] || '/dev/ttyACM0';
// const SERIAL_BAUD = parseInt(process.argv[3]) || 9600;
// const WS_PORT = 8765;
// const RECONNECT_INTERVAL = 3000;

// // ========== STATE ==========
// let serialPort = null;
// let parser = null;
// let wsClients = new Set();
// let isConnected = false;
// let simulationMode = false;

// // Queue system
// let commandQueue = [];
// let processingCommand = null; // {command, params}

// // Commands that do not block the queue
// const NON_BLOCKING = ['CONVEYOR'];

// // ========== SERIAL CONNECTION ==========
// function connectSerial() {
//   console.log(`[SERIAL] Connecting to ${SERIAL_PATH} at ${SERIAL_BAUD} baud...`);
//   try {
//     serialPort = new SerialPort({ path: SERIAL_PATH, baudRate: SERIAL_BAUD, autoOpen: false });
//     parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

//     serialPort.open((err) => {
//       if (err) {
//         console.error(`[SERIAL] Failed to open: ${err.message}`);
//         simulationMode = true;
//         broadcastToClients({ type: 'SYSTEM', message: 'Arduino not found - simulation mode active' });
//         return;
//       }
//       isConnected = true;
//       simulationMode = false;
//       console.log(`[SERIAL] Connected to ${SERIAL_PATH}`);
//       broadcastToClients({ type: 'SYSTEM', message: 'Arduino connected' });
//       processQueue();
//     });

//     parser.on('data', handleSerialData);

//     serialPort.on('error', (err) => { console.error(`[SERIAL] Error: ${err.message}`); isConnected = false; });
//     serialPort.on('close', () => { console.log('[SERIAL] Connection closed'); isConnected = false; setTimeout(connectSerial, RECONNECT_INTERVAL); });

//   } catch (err) {
//     console.error(`[SERIAL] Exception: ${err.message}`);
//     simulationMode = true;
//     broadcastToClients({ type: 'SYSTEM', message: 'Simulation mode active due to serial error' });
//   }
// }

// // ========== PARSE ARDUINO ==========
// function parseArduinoResponse(line) {
//   const parts = line.split(':');
//   const type = parts[0];
//   switch (type) {
//     case 'ACK': return { type: 'ACK', command: parts[1] || '', data: parts.slice(2).join(':') };
//     case 'DONE': return { type: 'DONE', command: parts[1] || '', data: parts.slice(2).join(':') };
//     case 'STATUS': return { type: 'STATUS', state: parts[1] || '', details: parts.slice(2).join(':') };
//     case 'ERROR': return { type: 'ERROR', code: parts[1] || '', message: parts.slice(2).join(':') };
//     case 'LOG': return { type: 'LOG', message: parts.slice(1).join(':') };
//     default: return { type: 'RAW', message: line };
//   }
// }

// // ========== HANDLE SERIAL DATA ==========
// function handleSerialData(line) {
//   const trimmed = line.trim();
//   if (!trimmed) return;
//   console.log(`[ARDUINO → WS] ${trimmed}`);
//   const parsed = parseArduinoResponse(trimmed);
//   broadcastToClients(parsed);

//   // If current command is DONE, clear it and process next
//   if (parsed.type === 'DONE') {
//     processingCommand = null;
//     processQueue();
//   }
// }

// // ========== QUEUE PROCESSOR ==========
// function processQueue() {
//   if (processingCommand || commandQueue.length === 0) return;

//   const next = commandQueue.shift();
//   processingCommand = next;

//   if (simulationMode) {
//     simulateCommand(next.command, next.params);
//     return;
//   }

//   if (!isConnected || !serialPort) {
//     broadcastToClients({ type: 'ERROR', code: 'NO_CONNECTION', message: 'Arduino not connected' });
//     processingCommand = null;
//     processQueue();
//     return;
//   }

//   const fullCmd = next.params ? `${next.command}:${next.params}\n` : `${next.command}\n`;
//   console.log(`[QUEUE → ARDUINO] ${fullCmd.trim()}`);
//   serialPort.write(fullCmd, (err) => {
//     if (err) {
//       broadcastToClients({ type: 'ERROR', code: 'WRITE_FAIL', message: err.message });
//       processingCommand = null;
//       processQueue();
//     }
//   });
// }

// // ========== SEND COMMAND ==========
// function sendCommand(command, params) {
//   // NON_BLOCKING commands bypass queue if nothing processing
//   if (NON_BLOCKING.includes(command)) {
//     if (simulationMode) {
//       simulateCommand(command, params || '');
//     } else {
//       const fullCmd = params ? `${command}:${params}\n` : `${command}\n`;
//       console.log(`[WS → ARDUINO] ${fullCmd.trim()}`);
//       serialPort.write(fullCmd);
//     }
//     return;
//   }

//   // Otherwise push into queue
//   commandQueue.push({ command, params });
//   processQueue();
// }

// // ========== SIMULATION ==========
// function simulateCommand(cmd, params) {
//   console.log(`[SIMULATION] Command: ${cmd}:${params}`);
//   broadcastToClients({ type: 'ACK', command: cmd, data: params });
//   broadcastToClients({ type: 'LOG', message: `[SIM] Executing ${cmd} with params: ${params}` });

//   const count = parseInt(params) || 1;
//   let delay = 500;

//   switch (cmd) {
//     case 'PICK': delay = count * 300; break;
//     case 'PACK': delay = count * 600; break;
//     case 'CONVEYOR':
//       if (params === 'START') { broadcastToClients({ type: 'LOG', message: '[SIM] Conveyor running...' }); return; }
//       delay = 0; break;
//     case 'DELIVER': delay = 3600; break;
//     case 'COLLECT': delay = count * 1200; break;
//     case 'STATUS':
//       broadcastToClients({ type: 'STATUS', state: 'IDLE', details: 'simulation_mode=true' });
//       return;
//     case 'ESTOP':
//       broadcastToClients({ type: 'LOG', message: '[SIM] !!! EMERGENCY STOP !!!' });
//       broadcastToClients({ type: 'STATUS', state: 'ESTOP', details: 'All operations halted' });
//       return;
//     case 'RESET':
//       broadcastToClients({ type: 'STATUS', state: 'IDLE', details: 'System reset' });
//       broadcastToClients({ type: 'DONE', command: 'RESET' });
//       return;
//   }

//   // simulate all blinks
//   let completed = 0;
//   for (let i = 1; i <= count; i++) {
//     setTimeout(() => {
//       broadcastToClients({ type: 'LOG', message: `[SIM] LED blink ${i}/${count} - ${cmd}` });
//       completed++;
//       if (completed === count) broadcastToClients({ type: 'DONE', command: cmd });
//     }, i * (delay / count));
//   }
// }

// // ========== WEBSOCKET ==========
// const wss = new WebSocketServer({ port: WS_PORT });
// wss.on('listening', () => console.log(`[WS] WebSocket server running on ws://localhost:${WS_PORT}`));

// wss.on('connection', (ws) => {
//   wsClients.add(ws);
//   console.log(`[WS] Client connected (total: ${wsClients.size})`);

//   ws.send(JSON.stringify({
//     type: 'SYSTEM',
//     message: simulationMode ? 'Connected (simulation mode)' : 'Connected to Arduino',
//     simulationMode,
//     isConnected,
//   }));

//   ws.on('message', (data) => {
//     try {
//       const msg = JSON.parse(data.toString());
//       const { command, params } = msg;
//       if (!command) return ws.send(JSON.stringify({ type: 'ERROR', code: 'NO_CMD', message: 'Missing command field' }));
//       sendCommand(command.toUpperCase(), params || '');
//     } catch {
//       ws.send(JSON.stringify({ type: 'ERROR', code: 'PARSE', message: 'Invalid JSON' }));
//     }
//   });

//   ws.on('close', () => { wsClients.delete(ws); console.log(`[WS] Client disconnected (total: ${wsClients.size})`); });
// });

// // ========== BROADCAST ==========
// function broadcastToClients(data) {
//   const json = JSON.stringify(data);
//   for (const client of wsClients) if (client.readyState === 1) client.send(json);
// }

// // ========== STARTUP ==========
// console.log('');
// console.log('╔══════════════════════════════════════════╗');
// console.log('║    AutoShop Serial Bridge Server v5.0    ║');
// console.log('╠══════════════════════════════════════════╣');
// console.log(`║  Serial: ${SERIAL_PATH.padEnd(30)}║`);
// console.log(`║  Baud:   ${String(SERIAL_BAUD).padEnd(30)}║`);
// console.log(`║  WS:     ws://localhost:${String(WS_PORT).padEnd(19)}║`);
// console.log('╚══════════════════════════════════════════╝');
// console.log('');

// connectSerial();

// // ========== GRACEFUL SHUTDOWN ==========
// process.on('SIGINT', () => {
//   console.log('\n[SHUTDOWN] Cleaning up...');
//   if (isConnected && serialPort) serialPort.write('ESTOP\n');
//   setTimeout(() => serialPort?.close(), 500);
//   setTimeout(() => process.exit(0), 1000);
// });














// #!/usr/bin/env node
// /**
//  * AutoShop Serial Bridge Server
//  * ==============================
//  * Bridges Arduino (USB Serial) ↔ Web App (WebSocket)
//  * Now with BUSY lock: blocks new commands until previous DONE
//  */

// const { SerialPort } = require('serialport');
// const { ReadlineParser } = require('@serialport/parser-readline');
// const { WebSocketServer } = require('ws');

// // ========== CONFIGURATION ==========
// const SERIAL_PATH = process.argv[2] || '/dev/ttyACM0';
// const SERIAL_BAUD = parseInt(process.argv[3]) || 9600;
// const WS_PORT = 8765;
// const RECONNECT_INTERVAL = 3000;

// // ========== STATE ==========
// let serialPort = null;
// let parser = null;
// let wsClients = new Set();
// let isConnected = false;
// let simulationMode = false;
// let isBusy = false;

// // ========== SERIAL CONNECTION ==========
// function connectSerial() {
//   console.log(`[SERIAL] Connecting to ${SERIAL_PATH} at ${SERIAL_BAUD} baud...`);

//   try {
//     serialPort = new SerialPort({ path: SERIAL_PATH, baudRate: SERIAL_BAUD, autoOpen: false });
//     parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

//     serialPort.open((err) => {
//       if (err) {
//         console.error(`[SERIAL] Failed to open: ${err.message}`);
//         simulationMode = true;
//         broadcastToClients({ type: 'SYSTEM', message: 'Arduino not found - simulation mode active' });
//         return;
//       }
//       isConnected = true;
//       simulationMode = false;
//       console.log(`[SERIAL] Connected to ${SERIAL_PATH}`);
//       broadcastToClients({ type: 'SYSTEM', message: 'Arduino connected' });
//     });

//     parser.on('data', handleSerialData);

//     serialPort.on('error', (err) => {
//       console.error(`[SERIAL] Error: ${err.message}`);
//       isConnected = false;
//     });

//     serialPort.on('close', () => {
//       console.log('[SERIAL] Connection closed');
//       isConnected = false;
//       setTimeout(connectSerial, RECONNECT_INTERVAL);
//     });
//   } catch (err) {
//     console.error(`[SERIAL] Exception: ${err.message}`);
//     simulationMode = true;
//     broadcastToClients({ type: 'SYSTEM', message: 'Simulation mode active due to serial error' });
//   }
// }

// // ========== PARSE ARDUINO RESPONSES ==========
// function parseArduinoResponse(line) {
//   const parts = line.split(':');
//   const type = parts[0];

//   switch (type) {
//     case 'ACK':
//       return { type: 'ACK', command: parts[1] || '', data: parts.slice(2).join(':') };
//     case 'DONE':
//       return { type: 'DONE', command: parts[1] || '', data: parts.slice(2).join(':') };
//     case 'STATUS':
//       return { type: 'STATUS', state: parts[1] || '', details: parts.slice(2).join(':') };
//     case 'ERROR':
//       return { type: 'ERROR', code: parts[1] || '', message: parts.slice(2).join(':') };
//     case 'LOG':
//       return { type: 'LOG', message: parts.slice(1).join(':') };
//     default:
//       return { type: 'RAW', message: line };
//   }
// }

// // ========== HANDLE SERIAL DATA ==========
// function handleSerialData(line) {
//   const trimmed = line.trim();
//   if (!trimmed) return;

//   console.log(`[ARDUINO → WS] ${trimmed}`);
//   const parsed = parseArduinoResponse(trimmed);
//   broadcastToClients(parsed);

//   // Clear busy when DONE
//   if (parsed.type === 'DONE') isBusy = false;
// }

// // ========== SIMULATION MODE ==========
// function simulateCommand(cmd, params) {
//   console.log(`[SIMULATION] Command: ${cmd}:${params}`);
//   broadcastToClients({ type: 'ACK', command: cmd, data: params });
//   broadcastToClients({ type: 'LOG', message: `[SIM] Executing ${cmd} with params: ${params}` });

//   const count = parseInt(params) || 1;
//   let delay = 500;

//   switch (cmd) {
//     case 'PICK': delay = count * 300; break;
//     case 'PACK': delay = count * 600; break;
//     case 'CONVEYOR':
//       if (params === 'START') {
//         broadcastToClients({ type: 'LOG', message: '[SIM] Conveyor LED pulsing continuously...' });
//         isBusy = false; // conveyor does not block
//         return;
//       }
//       delay = 0; break;
//     case 'DELIVER': delay = 3600; break;
//     case 'COLLECT': delay = count * 1200; break;
//     case 'STATUS':
//       broadcastToClients({ type: 'STATUS', state: 'IDLE', details: 'simulation_mode=true' });
//       isBusy = false;
//       return;
//     case 'ESTOP':
//       broadcastToClients({ type: 'LOG', message: '[SIM] !!! EMERGENCY STOP !!!' });
//       broadcastToClients({ type: 'STATUS', state: 'ESTOP', details: 'All operations halted' });
//       isBusy = false;
//       return;
//     case 'RESET':
//       broadcastToClients({ type: 'STATUS', state: 'IDLE', details: 'System reset' });
//       broadcastToClients({ type: 'DONE', command: 'RESET' });
//       isBusy = false;
//       return;
//   }

//   setTimeout(() => {
//     broadcastToClients({ type: 'DONE', command: cmd });
//     broadcastToClients({ type: 'LOG', message: `[SIM] ${cmd} complete` });
//     isBusy = false;
//   }, delay);
// }

// // ========== SEND TO ARDUINO (with BUSY lock) ==========
// function sendToArduino(command, params) {
//   const exemptCommands = ['CONVEYOR'];

//   if (isBusy && !exemptCommands.includes(command)) {
//     broadcastToClients({ type: 'ERROR', code: 'BUSY', message: `System busy, cannot execute ${command}` });
//     console.log(`[WS → ARDUINO] BLOCKED ${command}:${params} (BUSY)`);
//     return;
//   }

//   const fullCmd = params ? `${command}:${params}\n` : `${command}\n`;

//   if (simulationMode) {
//     isBusy = true;
//     simulateCommand(command, params || '');
//     return;
//   }

//   if (!isConnected || !serialPort) {
//     broadcastToClients({ type: 'ERROR', code: 'NO_CONNECTION', message: 'Arduino not connected' });
//     return;
//   }

//   isBusy = true;
//   console.log(`[WS → ARDUINO] ${fullCmd.trim()}`);
//   serialPort.write(fullCmd, (err) => {
//     if (err) {
//       console.error(`[SERIAL] Write error: ${err.message}`);
//       broadcastToClients({ type: 'ERROR', code: 'WRITE_FAIL', message: err.message });
//       isBusy = false;
//     }
//   });
// }

// // ========== WEBSOCKET SERVER ==========
// const wss = new WebSocketServer({ port: WS_PORT });
// wss.on('listening', () => console.log(`[WS] WebSocket server running on ws://localhost:${WS_PORT}`));

// wss.on('connection', (ws) => {
//   wsClients.add(ws);
//   console.log(`[WS] Client connected (total: ${wsClients.size})`);

//   ws.send(JSON.stringify({
//     type: 'SYSTEM',
//     message: simulationMode ? 'Connected (simulation mode)' : 'Connected to Arduino',
//     simulationMode,
//     isConnected,
//   }));

//   ws.on('message', (data) => {
//     try {
//       const msg = JSON.parse(data.toString());
//       const { command, params } = msg;
//       if (!command) return ws.send(JSON.stringify({ type: 'ERROR', code: 'NO_CMD', message: 'Missing command field' }));

//       sendToArduino(command.toUpperCase(), params || '');
//     } catch {
//       ws.send(JSON.stringify({ type: 'ERROR', code: 'PARSE', message: 'Invalid JSON' }));
//     }
//   });

//   ws.on('close', () => {
//     wsClients.delete(ws);
//     console.log(`[WS] Client disconnected (total: ${wsClients.size})`);
//   });
// });

// // ========== BROADCAST ==========
// function broadcastToClients(data) {
//   const json = JSON.stringify(data);
//   for (const client of wsClients) {
//     if (client.readyState === 1) client.send(json);
//   }
// }

// // ========== STARTUP ==========
// console.log('');
// console.log('╔══════════════════════════════════════════╗');
// console.log('║    AutoShop Serial Bridge Server v4.0    ║');
// console.log('╠══════════════════════════════════════════╣');
// console.log(`║  Serial: ${SERIAL_PATH.padEnd(30)}║`);
// console.log(`║  Baud:   ${String(SERIAL_BAUD).padEnd(30)}║`);
// console.log(`║  WS:     ws://localhost:${String(WS_PORT).padEnd(19)}║`);
// console.log('╚══════════════════════════════════════════╝');
// console.log('');

// connectSerial();

// // ========== GRACEFUL SHUTDOWN ==========
// process.on('SIGINT', () => {
//   console.log('\n[SHUTDOWN] Cleaning up...');
//   if (isConnected && serialPort) serialPort.write('ESTOP\n');
//   setTimeout(() => serialPort?.close(), 500);
//   setTimeout(() => process.exit(0), 1000);
// });







































// true
// #!/usr/bin/env node
// /**
//  * AutoShop Serial Bridge Server
//  * ==============================
//  * 
//  * Bridges Arduino (USB Serial) ↔ Web App (WebSocket)
//  * 
//  * USAGE:
//  *   npm install serialport ws
//  *   node serial-bridge.js [PORT] [BAUD]
//  *   
//  *   Example: node serial-bridge.js /dev/ttyACM0 9600
//  *   Windows:  node serial-bridge.js COM3 9600
//  * 
//  * The bridge:
//  *   1. Opens serial connection to Arduino
//  *   2. Starts WebSocket server on port 8765
//  *   3. Forwards commands from WebSocket → Arduino
//  *   4. Forwards responses from Arduino → WebSocket
//  * 
//  * WEB APP connects to ws://localhost:8765 and sends JSON:
//  *   { "command": "PICK", "params": "3" }
//  *   → Sends "PICK:3\n" to Arduino
//  * 
//  * Arduino responses forwarded as JSON:
//  *   { "type": "ACK", "command": "PICK", "data": "3" }
//  *   { "type": "DONE", "command": "PICK" }
//  *   { "type": "LOG", "message": "Picking 3 item(s)..." }
//  */

// const { SerialPort } = require('serialport');
// const { ReadlineParser } = require('@serialport/parser-readline');
// const { WebSocketServer } = require('ws');

// // ========== CONFIGURATION ==========
// const SERIAL_PATH = process.argv[2] || '/dev/ttyACM0';
// const SERIAL_BAUD = parseInt(process.argv[3]) || 9600;
// const WS_PORT = 8765;
// const RECONNECT_INTERVAL = 3000;

// // ========== STATE ==========
// let serialPort = null;
// let parser = null;
// let wsClients = new Set();
// let isConnected = false;
// let simulationMode = false;

// // ========== SERIAL CONNECTION ==========
// function connectSerial() {
//   console.log(`[SERIAL] Connecting to ${SERIAL_PATH} at ${SERIAL_BAUD} baud...`);
  
//   try {
//     serialPort = new SerialPort({
//       path: SERIAL_PATH,
//       baudRate: SERIAL_BAUD,
//       autoOpen: false,
//     });

//     parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

//     serialPort.open((err) => {
//       if (err) {
//         console.error(`[SERIAL] Failed to open: ${err.message}`);
//         console.log('[SERIAL] Falling back to SIMULATION MODE');
//         simulationMode = true;
//         broadcastToClients({ type: 'SYSTEM', message: 'Arduino not found - simulation mode active' });
//         return;
//       }
      
//       isConnected = true;
//       simulationMode = false;
//       console.log(`[SERIAL] Connected to ${SERIAL_PATH}`);
//       broadcastToClients({ type: 'SYSTEM', message: 'Arduino connected' });
//     });

//     // Handle incoming data from Arduino
//     parser.on('data', (line) => {
//       const trimmed = line.trim();
//       if (!trimmed) return;
      
//       console.log(`[ARDUINO → WS] ${trimmed}`);
      
//       const parsed = parseArduinoResponse(trimmed);
//       broadcastToClients(parsed);
//     });

//     serialPort.on('error', (err) => {
//       console.error(`[SERIAL] Error: ${err.message}`);
//       isConnected = false;
//     });

//     serialPort.on('close', () => {
//       console.log('[SERIAL] Connection closed');
//       isConnected = false;
//       // Auto-reconnect
//       setTimeout(connectSerial, RECONNECT_INTERVAL);
//     });

//   } catch (err) {
//     console.error(`[SERIAL] Exception: ${err.message}`);
//     simulationMode = true;
//     console.log('[SERIAL] Falling back to SIMULATION MODE');
//   }
// }

// // ========== PARSE ARDUINO RESPONSES ==========
// function parseArduinoResponse(line) {
//   const parts = line.split(':');
//   const type = parts[0];
  
//   switch (type) {
//     case 'ACK':
//       return { type: 'ACK', command: parts[1] || '', data: parts.slice(2).join(':') };
//     case 'DONE':
//       return { type: 'DONE', command: parts[1] || '', data: parts.slice(2).join(':') };
//     case 'STATUS':
//       return { type: 'STATUS', state: parts[1] || '', details: parts.slice(2).join(':') };
//     case 'ERROR':
//       return { type: 'ERROR', code: parts[1] || '', message: parts.slice(2).join(':') };
//     case 'LOG':
//       return { type: 'LOG', message: parts.slice(1).join(':') };
//     default:
//       return { type: 'RAW', message: line };
//   }
// }

// // ========== SIMULATION MODE ==========
// function simulateCommand(cmd, params) {
//   console.log(`[SIMULATION] Command: ${cmd}:${params}`);
  
//   broadcastToClients({ type: 'ACK', command: cmd, data: params });
//   broadcastToClients({ type: 'LOG', message: `[SIM] Executing ${cmd} with params: ${params}` });
  
//   const count = parseInt(params) || 1;
//   let delay = 0;
  
//   switch (cmd) {
//     case 'PICK':
//       delay = count * 300; // 150ms on + 150ms off per blink
//       for (let i = 1; i <= count; i++) {
//         setTimeout(() => {
//           broadcastToClients({ type: 'LOG', message: `[SIM] LED blink ${i}/${count} - picking item ${i}` });
//         }, i * 300);
//       }
//       break;
//     case 'PACK':
//       delay = count * 600; // 300ms on + 300ms off per blink
//       for (let i = 1; i <= count; i++) {
//         setTimeout(() => {
//           broadcastToClients({ type: 'LOG', message: `[SIM] LED blink ${i}/${count} - packing item ${i}` });
//         }, i * 600);
//       }
//       break;
//     case 'CONVEYOR':
//       if (params === 'START') {
//         broadcastToClients({ type: 'LOG', message: '[SIM] Conveyor LED pulsing continuously...' });
//         return; // No DONE for conveyor start
//       }
//       delay = 0;
//       break;
//     case 'DELIVER':
//       delay = 3600; // 3 × (800+400)
//       break;
//     case 'COLLECT':
//       delay = count * 1200; // 600ms on + 600ms off
//       break;
//     case 'STATUS':
//       broadcastToClients({ type: 'STATUS', state: 'IDLE', details: 'simulation_mode=true' });
//       return;
//     case 'ESTOP':
//       broadcastToClients({ type: 'LOG', message: '[SIM] !!! EMERGENCY STOP !!!' });
//       broadcastToClients({ type: 'STATUS', state: 'ESTOP', details: 'All operations halted' });
//       return;
//     case 'RESET':
//       broadcastToClients({ type: 'STATUS', state: 'IDLE', details: 'System reset' });
//       broadcastToClients({ type: 'DONE', command: 'RESET' });
//       return;
//     default:
//       delay = 500;
//   }
  
//   setTimeout(() => {
//     broadcastToClients({ type: 'DONE', command: cmd });
//     broadcastToClients({ type: 'LOG', message: `[SIM] ${cmd} complete` });
//   }, delay);
// }

// // ========== SEND TO ARDUINO ==========
// function sendToArduino(command, params) {
//   const fullCmd = params ? `${command}:${params}\n` : `${command}\n`;
  
//   if (simulationMode) {
//     simulateCommand(command, params || '');
//     return;
//   }
  
//   if (!isConnected || !serialPort) {
//     broadcastToClients({ type: 'ERROR', code: 'NO_CONNECTION', message: 'Arduino not connected' });
//     return;
//   }
  
//   console.log(`[WS → ARDUINO] ${fullCmd.trim()}`);
//   serialPort.write(fullCmd, (err) => {
//     if (err) {
//       console.error(`[SERIAL] Write error: ${err.message}`);
//       broadcastToClients({ type: 'ERROR', code: 'WRITE_FAIL', message: err.message });
//     }
//   });
// }

// // ========== WEBSOCKET SERVER ==========
// const wss = new WebSocketServer({ port: WS_PORT });

// wss.on('listening', () => {
//   console.log(`[WS] WebSocket server running on ws://localhost:${WS_PORT}`);
// });

// wss.on('connection', (ws) => {
//   wsClients.add(ws);
//   console.log(`[WS] Client connected (total: ${wsClients.size})`);
  
//   // Send current status to new client
//   ws.send(JSON.stringify({
//     type: 'SYSTEM',
//     message: simulationMode ? 'Connected (simulation mode)' : 'Connected to Arduino',
//     simulationMode,
//     isConnected,
//   }));
  
//   ws.on('message', (data) => {
//     try {
//       const msg = JSON.parse(data.toString());
//       const { command, params } = msg;
      
//       if (!command) {
//         ws.send(JSON.stringify({ type: 'ERROR', code: 'NO_CMD', message: 'Missing command field' }));
//         return;
//       }
      
//       sendToArduino(command.toUpperCase(), params || '');
      
//     } catch (err) {
//       ws.send(JSON.stringify({ type: 'ERROR', code: 'PARSE', message: 'Invalid JSON' }));
//     }
//   });
  
//   ws.on('close', () => {
//     wsClients.delete(ws);
//     console.log(`[WS] Client disconnected (total: ${wsClients.size})`);
//   });
// });

// function broadcastToClients(data) {
//   const json = JSON.stringify(data);
//   for (const client of wsClients) {
//     if (client.readyState === 1) { // OPEN
//       client.send(json);
//     }
//   }
// }

// // ========== STARTUP ==========
// console.log('');
// console.log('╔══════════════════════════════════════════╗');
// console.log('║    AutoShop Serial Bridge Server v1.0    ║');
// console.log('╠══════════════════════════════════════════╣');
// console.log(`║  Serial: ${SERIAL_PATH.padEnd(30)}║`);
// console.log(`║  Baud:   ${String(SERIAL_BAUD).padEnd(30)}║`);
// console.log(`║  WS:     ws://localhost:${String(WS_PORT).padEnd(19)}║`);
// console.log('╚══════════════════════════════════════════╝');
// console.log('');

// connectSerial();

// // ========== GRACEFUL SHUTDOWN ==========
// process.on('SIGINT', () => {
//   console.log('\n[SHUTDOWN] Cleaning up...');
  
//   // Send ESTOP to Arduino on shutdown
//   if (isConnected && serialPort) {
//     serialPort.write('ESTOP\n');
//     setTimeout(() => {
//       serialPort.close();
//       process.exit(0);
//     }, 500);
//   } else {
//     process.exit(0);
//   }
// });






















































// third 
// #!/usr/bin/env node
// /**
//  * AutoShop Serial Bridge Server (Production Corrected)
//  * ===================================================
//  * Proper queued command state machine:
//  * - Waits for DONE from Arduino or simulation before sending next command
//  * - Compatible with simulation mode
//  * - No race conditions
//  */

// const { SerialPort } = require('serialport');
// const { ReadlineParser } = require('@serialport/parser-readline');
// const { WebSocketServer } = require('ws');

// // ========== CONFIG ==========
// const SERIAL_PATH = process.argv[2] || '/dev/ttyACM0';
// const SERIAL_BAUD = parseInt(process.argv[3]) || 9600;
// const WS_PORT = 8765;
// const RECONNECT_INTERVAL = 3000;

// // ========== STATE ==========
// let serialPort = null;
// let parser = null;
// let wsClients = new Set();
// let isConnected = false;
// let simulationMode = false;

// // Command queue using promises for proper sequencing
// const commandQueue = [];
// let isProcessing = false;

// // ========== SERIAL CONNECTION ==========
// function connectSerial() {
//   console.log(`[SERIAL] Connecting to ${SERIAL_PATH} at ${SERIAL_BAUD} baud...`);

//   try {
//     serialPort = new SerialPort({
//       path: SERIAL_PATH,
//       baudRate: SERIAL_BAUD,
//       autoOpen: false,
//     });

//     parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

//     serialPort.open((err) => {
//       if (err) {
//         console.error(`[SERIAL] Failed to open: ${err.message}`);
//         console.log('[SERIAL] Falling back to SIMULATION MODE');
//         simulationMode = true;
//         broadcastToClients({ type: 'SYSTEM', message: 'Arduino not found - simulation mode active' });
//         return;
//       }

//       isConnected = true;
//       simulationMode = false;
//       console.log(`[SERIAL] Connected to ${SERIAL_PATH}`);
//       broadcastToClients({ type: 'SYSTEM', message: 'Arduino connected' });
//       processQueue();
//     });

//     parser.on('data', handleSerialData);

//     serialPort.on('error', (err) => {
//       console.error(`[SERIAL] Error: ${err.message}`);
//       isConnected = false;
//     });

//     serialPort.on('close', () => {
//       console.log('[SERIAL] Connection closed');
//       isConnected = false;
//       setTimeout(connectSerial, RECONNECT_INTERVAL);
//     });
//   } catch (err) {
//     console.error(`[SERIAL] Exception: ${err.message}`);
//     simulationMode = true;
//     console.log('[SERIAL] Falling back to SIMULATION MODE');
//   }
// }

// // ========== HANDLE SERIAL DATA ==========
// function handleSerialData(line) {
//   const trimmed = line.trim();
//   if (!trimmed) return;

//   console.log(`[ARDUINO → WS] ${trimmed}`);
//   const parsed = parseArduinoResponse(trimmed);
//   broadcastToClients(parsed);

//   // Resolve current command when DONE is received
//   if (parsed.type === 'DONE' && commandQueue[0]?.resolve) {
//     commandQueue[0].resolve();
//   }
// }

// // ========== PARSE ARDUINO RESPONSES ==========
// function parseArduinoResponse(line) {
//   const parts = line.split(':');
//   const type = parts[0];

//   switch (type) {
//     case 'ACK':
//       return { type: 'ACK', command: parts[1] || '', data: parts.slice(2).join(':') };
//     case 'DONE':
//       return { type: 'DONE', command: parts[1] || '', data: parts.slice(2).join(':') };
//     case 'STATUS':
//       return { type: 'STATUS', state: parts[1] || '', details: parts.slice(2).join(':') };
//     case 'ERROR':
//       return { type: 'ERROR', code: parts[1] || '', message: parts.slice(2).join(':') };
//     case 'LOG':
//       return { type: 'LOG', message: parts.slice(1).join(':') };
//     default:
//       return { type: 'RAW', message: line };
//   }
// }

// // ========== SIMULATION COMMAND ==========
// function simulateCommand(cmd, params) {
//   return new Promise((resolve) => {
//     console.log(`[SIMULATION] Command: ${cmd}:${params}`);
//     broadcastToClients({ type: 'ACK', command: cmd, data: params });
//     broadcastToClients({ type: 'LOG', message: `[SIM] Executing ${cmd} with params: ${params}` });

//     const count = parseInt(params) || 1;
//     let delay = 500;

//     switch (cmd) {
//       case 'PICK': delay = count * 300; break;
//       case 'PACK': delay = count * 600; break;
//       case 'CONVEYOR': 
//         if (params === 'START') {
//           broadcastToClients({ type: 'LOG', message: '[SIM] Conveyor LED pulsing continuously...' });
//           return resolve(); // Done immediately
//         } 
//         delay = 0; break;
//       case 'DELIVER': delay = 3600; break;
//       case 'COLLECT': delay = count * 1200; break;
//       case 'STATUS':
//         broadcastToClients({ type: 'STATUS', state: 'IDLE', details: 'simulation_mode=true' });
//         return resolve();
//       case 'ESTOP':
//         broadcastToClients({ type: 'LOG', message: '[SIM] !!! EMERGENCY STOP !!!' });
//         broadcastToClients({ type: 'STATUS', state: 'ESTOP', details: 'All operations halted' });
//         return resolve();
//       case 'RESET':
//         broadcastToClients({ type: 'STATUS', state: 'IDLE', details: 'System reset' });
//         broadcastToClients({ type: 'DONE', command: 'RESET' });
//         return resolve();
//     }

//     setTimeout(() => {
//       broadcastToClients({ type: 'DONE', command: cmd });
//       broadcastToClients({ type: 'LOG', message: `[SIM] ${cmd} complete` });
//       resolve();
//     }, delay);
//   });
// }

// // ========== ENQUEUE COMMAND ==========
// function enqueueCommand(command, params) {
//   return new Promise((resolve) => {
//     commandQueue.push({ command, params, resolve });
//     processQueue();
//   });
// }

// // ========== PROCESS QUEUE ==========
// async function processQueue() {
//   if (isProcessing || commandQueue.length === 0) return;
//   isProcessing = true;

//   while (commandQueue.length > 0) {
//     const { command, params, resolve } = commandQueue[0];

//     if (simulationMode) {
//       await simulateCommand(command, params);
//     } else {
//       await new Promise((cmdResolve) => {
//         if (!isConnected || !serialPort) {
//           broadcastToClients({ type: 'ERROR', code: 'NO_CONNECTION', message: 'Arduino not connected' });
//           return cmdResolve();
//         }
//         const fullCmd = params ? `${command}:${params}\n` : `${command}\n`;
//         console.log(`[WS → ARDUINO] ${fullCmd.trim()}`);
//         serialPort.write(fullCmd, (err) => {
//           if (err) {
//             console.error(`[SERIAL] Write error: ${err.message}`);
//             broadcastToClients({ type: 'ERROR', code: 'WRITE_FAIL', message: err.message });
//             cmdResolve();
//           }
//         });

//         // Wait for DONE from handleSerialData
//         commandQueue[0].resolve = () => {
//           cmdResolve();
//         };
//       });
//     }

//     commandQueue.shift(); // remove completed command
//   }

//   isProcessing = false;
// }

// // ========== WEBSOCKET SERVER ==========
// const wss = new WebSocketServer({ port: WS_PORT });
// wss.on('listening', () => console.log(`[WS] WebSocket server running on ws://localhost:${WS_PORT}`));

// wss.on('connection', (ws) => {
//   wsClients.add(ws);
//   console.log(`[WS] Client connected (total: ${wsClients.size})`);

//   ws.send(JSON.stringify({
//     type: 'SYSTEM',
//     message: simulationMode ? 'Connected (simulation mode)' : 'Connected to Arduino',
//     simulationMode,
//     isConnected,
//   }));

//   ws.on('message', (data) => {
//     try {
//       const msg = JSON.parse(data.toString());
//       const { command, params } = msg;
//       if (!command) return ws.send(JSON.stringify({ type: 'ERROR', code: 'NO_CMD', message: 'Missing command field' }));

//       enqueueCommand(command.toUpperCase(), params || '');
//     } catch {
//       ws.send(JSON.stringify({ type: 'ERROR', code: 'PARSE', message: 'Invalid JSON' }));
//     }
//   });

//   ws.on('close', () => {
//     wsClients.delete(ws);
//     console.log(`[WS] Client disconnected (total: ${wsClients.size})`);
//   });
// });

// function broadcastToClients(data) {
//   const json = JSON.stringify(data);
//   for (const client of wsClients) {
//     if (client.readyState === 1) client.send(json);
//   }
// }

// // ========== STARTUP ==========
// console.log(`
// ╔══════════════════════════════════════════╗
// ║    AutoShop Serial Bridge Server v3.0    ║
// ╠══════════════════════════════════════════╣
// ║  Serial: ${SERIAL_PATH.padEnd(30)}║
// ║  Baud:   ${String(SERIAL_BAUD).padEnd(30)}║
// ║  WS:     ws://localhost:${String(WS_PORT).padEnd(19)}║
// ╚══════════════════════════════════════════╝
// `);

// connectSerial();

// // ========== GRACEFUL SHUTDOWN ==========
// process.on('SIGINT', () => {
//   console.log('\n[SHUTDOWN] Cleaning up...');
//   if (isConnected && serialPort) serialPort.write('ESTOP\n');
//   setTimeout(() => serialPort?.close(), 500);
//   setTimeout(() => process.exit(0), 1000);
// });



































// second 
// #!/usr/bin/env node
// /**
//  * AutoShop Serial Bridge Server (Production Clean)
//  * ================================================
//  * Queued command state machine: waits for DONE before sending next command.
//  */

// const { SerialPort } = require('serialport');
// const { ReadlineParser } = require('@serialport/parser-readline');
// const { WebSocketServer } = require('ws');

// // ========== CONFIGURATION ==========
// const SERIAL_PATH = process.argv[2] || '/dev/ttyACM0';
// const SERIAL_BAUD = parseInt(process.argv[3]) || 9600;
// const WS_PORT = 8765;
// const RECONNECT_INTERVAL = 3000;

// // ========== STATE ==========
// let serialPort = null;
// let parser = null;
// let wsClients = new Set();
// let isConnected = false;
// let simulationMode = false;

// // Command queue
// const commandQueue = [];
// let currentCommand = null;

// // ========== SERIAL CONNECTION ==========
// function connectSerial() {
//   console.log(`[SERIAL] Connecting to ${SERIAL_PATH} at ${SERIAL_BAUD} baud...`);

//   try {
//     serialPort = new SerialPort({
//       path: SERIAL_PATH,
//       baudRate: SERIAL_BAUD,
//       autoOpen: false,
//     });

//     parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

//     serialPort.open((err) => {
//       if (err) {
//         console.error(`[SERIAL] Failed to open: ${err.message}`);
//         console.log('[SERIAL] Falling back to SIMULATION MODE');
//         simulationMode = true;
//         broadcastToClients({ type: 'SYSTEM', message: 'Arduino not found - simulation mode active' });
//         return;
//       }

//       isConnected = true;
//       simulationMode = false;
//       console.log(`[SERIAL] Connected to ${SERIAL_PATH}`);
//       broadcastToClients({ type: 'SYSTEM', message: 'Arduino connected' });
//       processQueue();
//     });

//     parser.on('data', handleSerialData);

//     serialPort.on('error', (err) => {
//       console.error(`[SERIAL] Error: ${err.message}`);
//       isConnected = false;
//     });

//     serialPort.on('close', () => {
//       console.log('[SERIAL] Connection closed');
//       isConnected = false;
//       setTimeout(connectSerial, RECONNECT_INTERVAL);
//     });
//   } catch (err) {
//     console.error(`[SERIAL] Exception: ${err.message}`);
//     simulationMode = true;
//     console.log('[SERIAL] Falling back to SIMULATION MODE');
//   }
// }

// // ========== HANDLE SERIAL DATA ==========
// function handleSerialData(line) {
//   const trimmed = line.trim();
//   if (!trimmed) return;

//   console.log(`[ARDUINO → WS] ${trimmed}`);
//   const parsed = parseArduinoResponse(trimmed);
//   broadcastToClients(parsed);

//   // Only dequeue on DONE
//   if (parsed.type === 'DONE' && currentCommand && parsed.command === currentCommand.command) {
//     currentCommand = null;
//     processQueue();
//   }
// }

// // ========== PARSE ARDUINO RESPONSES ==========
// function parseArduinoResponse(line) {
//   const parts = line.split(':');
//   const type = parts[0];

//   switch (type) {
//     case 'ACK':
//       return { type: 'ACK', command: parts[1] || '', data: parts.slice(2).join(':') };
//     case 'DONE':
//       return { type: 'DONE', command: parts[1] || '', data: parts.slice(2).join(':') };
//     case 'STATUS':
//       return { type: 'STATUS', state: parts[1] || '', details: parts.slice(2).join(':') };
//     case 'ERROR':
//       return { type: 'ERROR', code: parts[1] || '', message: parts.slice(2).join(':') };
//     case 'LOG':
//       return { type: 'LOG', message: parts.slice(1).join(':') };
//     default:
//       return { type: 'RAW', message: line };
//   }
// }

// // ========== SIMULATION MODE ==========
// function simulateCommand(cmd, params) {
//   console.log(`[SIMULATION] Command: ${cmd}:${params}`);
//   broadcastToClients({ type: 'ACK', command: cmd, data: params });
//   broadcastToClients({ type: 'LOG', message: `[SIM] Executing ${cmd} with params: ${params}` });

//   const count = parseInt(params) || 1;
//   let delay = 0;

//   switch (cmd) {
//     case 'PICK':
//       delay = count * 300;
//       for (let i = 1; i <= count; i++) {
//         setTimeout(() => {
//           broadcastToClients({ type: 'LOG', message: `[SIM] LED blink ${i}/${count} - picking item ${i}` });
//         }, i * 300);
//       }
//       break;
//     case 'PACK':
//       delay = count * 600;
//       for (let i = 1; i <= count; i++) {
//         setTimeout(() => {
//           broadcastToClients({ type: 'LOG', message: `[SIM] LED blink ${i}/${count} - packing item ${i}` });
//         }, i * 600);
//       }
//       break;
//     case 'CONVEYOR':
//       if (params === 'START') {
//         broadcastToClients({ type: 'LOG', message: '[SIM] Conveyor LED pulsing continuously...' });
//         return; // No DONE for conveyor start
//       }
//       delay = 0;
//       break;
//     case 'DELIVER':
//       delay = 3600;
//       break;
//     case 'COLLECT':
//       delay = count * 1200;
//       break;
//     case 'STATUS':
//       broadcastToClients({ type: 'STATUS', state: 'IDLE', details: 'simulation_mode=true' });
//       return;
//     case 'ESTOP':
//       broadcastToClients({ type: 'LOG', message: '[SIM] !!! EMERGENCY STOP !!!' });
//       broadcastToClients({ type: 'STATUS', state: 'ESTOP', details: 'All operations halted' });
//       return;
//     case 'RESET':
//       broadcastToClients({ type: 'STATUS', state: 'IDLE', details: 'System reset' });
//       broadcastToClients({ type: 'DONE', command: 'RESET' });
//       return;
//     default:
//       delay = 500;
//   }

//   setTimeout(() => {
//     broadcastToClients({ type: 'DONE', command: cmd });
//     broadcastToClients({ type: 'LOG', message: `[SIM] ${cmd} complete` });
//     currentCommand = null;
//     processQueue();
//   }, delay);
// }

// // ========== COMMAND QUEUE HANDLER ==========
// function enqueueCommand(command, params) {
//   commandQueue.push({ command, params });
//   processQueue();
// }

// function processQueue() {
//   if (currentCommand || commandQueue.length === 0) return;

//   const next = commandQueue.shift();
//   currentCommand = next;

//   if (simulationMode) {
//     simulateCommand(next.command, next.params);
//   } else {
//     sendToArduino(next.command, next.params);
//   }
// }

// // ========== SEND TO ARDUINO ==========
// function sendToArduino(command, params) {
//   if (!isConnected || !serialPort) {
//     broadcastToClients({ type: 'ERROR', code: 'NO_CONNECTION', message: 'Arduino not connected' });
//     currentCommand = null;
//     processQueue();
//     return;
//   }

//   const fullCmd = params ? `${command}:${params}\n` : `${command}\n`;
//   console.log(`[WS → ARDUINO] ${fullCmd.trim()}`);

//   serialPort.write(fullCmd, (err) => {
//     if (err) {
//       console.error(`[SERIAL] Write error: ${err.message}`);
//       broadcastToClients({ type: 'ERROR', code: 'WRITE_FAIL', message: err.message });
//       currentCommand = null;
//       processQueue();
//     }
//   });
// }

// // ========== WEBSOCKET SERVER ==========
// const wss = new WebSocketServer({ port: WS_PORT });

// wss.on('listening', () => {
//   console.log(`[WS] WebSocket server running on ws://localhost:${WS_PORT}`);
// });

// wss.on('connection', (ws) => {
//   wsClients.add(ws);
//   console.log(`[WS] Client connected (total: ${wsClients.size})`);

//   ws.send(JSON.stringify({
//     type: 'SYSTEM',
//     message: simulationMode ? 'Connected (simulation mode)' : 'Connected to Arduino',
//     simulationMode,
//     isConnected,
//   }));

//   ws.on('message', (data) => {
//     try {
//       const msg = JSON.parse(data.toString());
//       const { command, params } = msg;

//       if (!command) {
//         ws.send(JSON.stringify({ type: 'ERROR', code: 'NO_CMD', message: 'Missing command field' }));
//         return;
//       }

//       enqueueCommand(command.toUpperCase(), params || '');
//     } catch (err) {
//       ws.send(JSON.stringify({ type: 'ERROR', code: 'PARSE', message: 'Invalid JSON' }));
//     }
//   });

//   ws.on('close', () => {
//     wsClients.delete(ws);
//     console.log(`[WS] Client disconnected (total: ${wsClients.size})`);
//   });
// });

// function broadcastToClients(data) {
//   const json = JSON.stringify(data);
//   for (const client of wsClients) {
//     if (client.readyState === 1) client.send(json);
//   }
// }

// // ========== STARTUP ==========
// console.log('');
// console.log('╔══════════════════════════════════════════╗');
// console.log('║    AutoShop Serial Bridge Server v2.0    ║');
// console.log('╠══════════════════════════════════════════╣');
// console.log(`║  Serial: ${SERIAL_PATH.padEnd(30)}║`);
// console.log(`║  Baud:   ${String(SERIAL_BAUD).padEnd(30)}║`);
// console.log(`║  WS:     ws://localhost:${String(WS_PORT).padEnd(19)}║`);
// console.log('╚══════════════════════════════════════════╝');
// console.log('');

// connectSerial();

// // ========== GRACEFUL SHUTDOWN ==========
// process.on('SIGINT', () => {
//   console.log('\n[SHUTDOWN] Cleaning up...');

//   if (isConnected && serialPort) {
//     serialPort.write('ESTOP\n');
//     setTimeout(() => {
//       serialPort.close();
//       process.exit(0);
//     }, 500);
//   } else {
//     process.exit(0);
//   }
// });

















































// mine 
// #!/usr/bin/env node
// /**
//  * AutoShop Serial Bridge Server
//  * ==============================
//  * 
//  * Bridges Arduino (USB Serial) ↔ Web App (WebSocket)
//  * 
//  * USAGE:
//  *   npm install serialport ws
//  *   node serial-bridge.js [PORT] [BAUD]
//  *   
//  *   Example: node serial-bridge.js /dev/ttyACM0 9600
//  *   Windows:  node serial-bridge.js COM3 9600
//  * 
//  * The bridge:
//  *   1. Opens serial connection to Arduino
//  *   2. Starts WebSocket server on port 8765
//  *   3. Forwards commands from WebSocket → Arduino
//  *   4. Forwards responses from Arduino → WebSocket
//  * 
//  * WEB APP connects to ws://localhost:8765 and sends JSON:
//  *   { "command": "PICK", "params": "3" }
//  *   → Sends "PICK:3\n" to Arduino
//  * 
//  * Arduino responses forwarded as JSON:
//  *   { "type": "ACK", "command": "PICK", "data": "3" }
//  *   { "type": "DONE", "command": "PICK" }
//  *   { "type": "LOG", "message": "Picking 3 item(s)..." }
//  */

// const { SerialPort } = require('serialport');
// const { ReadlineParser } = require('@serialport/parser-readline');
// const { WebSocketServer } = require('ws');

// // ========== CONFIGURATION ==========
// const SERIAL_PATH = process.argv[2] || '/dev/ttyACM0';
// const SERIAL_BAUD = parseInt(process.argv[3]) || 9600;
// const WS_PORT = 8765;
// const RECONNECT_INTERVAL = 3000;

// // ========== STATE ==========
// let serialPort = null;
// let parser = null;
// let wsClients = new Set();
// let isConnected = false;
// let simulationMode = false;

// // ========== SERIAL CONNECTION ==========
// function connectSerial() {
//   console.log(`[SERIAL] Connecting to ${SERIAL_PATH} at ${SERIAL_BAUD} baud...`);
  
//   try {
//     serialPort = new SerialPort({
//       path: SERIAL_PATH,
//       baudRate: SERIAL_BAUD,
//       autoOpen: false,
//     });

//     parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

//     serialPort.open((err) => {
//       if (err) {
//         console.error(`[SERIAL] Failed to open: ${err.message}`);
//         console.log('[SERIAL] Falling back to SIMULATION MODE');
//         simulationMode = true;
//         broadcastToClients({ type: 'SYSTEM', message: 'Arduino not found - simulation mode active' });
//         return;
//       }
      
//       isConnected = true;
//       simulationMode = false;
//       console.log(`[SERIAL] Connected to ${SERIAL_PATH}`);
//       broadcastToClients({ type: 'SYSTEM', message: 'Arduino connected' });
//     });

//     // Handle incoming data from Arduino
//     parser.on('data', (line) => {
//       const trimmed = line.trim();
//       if (!trimmed) return;
      
//       console.log(`[ARDUINO → WS] ${trimmed}`);
      
//       const parsed = parseArduinoResponse(trimmed);
//       broadcastToClients(parsed);
//     });

//     serialPort.on('error', (err) => {
//       console.error(`[SERIAL] Error: ${err.message}`);
//       isConnected = false;
//     });

//     serialPort.on('close', () => {
//       console.log('[SERIAL] Connection closed');
//       isConnected = false;
//       // Auto-reconnect
//       setTimeout(connectSerial, RECONNECT_INTERVAL);
//     });

//   } catch (err) {
//     console.error(`[SERIAL] Exception: ${err.message}`);
//     simulationMode = true;
//     console.log('[SERIAL] Falling back to SIMULATION MODE');
//   }
// }

// // ========== PARSE ARDUINO RESPONSES ==========
// function parseArduinoResponse(line) {
//   const parts = line.split(':');
//   const type = parts[0];
  
//   switch (type) {
//     case 'ACK':
//       return { type: 'ACK', command: parts[1] || '', data: parts.slice(2).join(':') };
//     case 'DONE':
//       return { type: 'DONE', command: parts[1] || '', data: parts.slice(2).join(':') };
//     case 'STATUS':
//       return { type: 'STATUS', state: parts[1] || '', details: parts.slice(2).join(':') };
//     case 'ERROR':
//       return { type: 'ERROR', code: parts[1] || '', message: parts.slice(2).join(':') };
//     case 'LOG':
//       return { type: 'LOG', message: parts.slice(1).join(':') };
//     default:
//       return { type: 'RAW', message: line };
//   }
// }

// // ========== SIMULATION MODE ==========
// function simulateCommand(cmd, params) {
//   console.log(`[SIMULATION] Command: ${cmd}:${params}`);
  
//   broadcastToClients({ type: 'ACK', command: cmd, data: params });
//   broadcastToClients({ type: 'LOG', message: `[SIM] Executing ${cmd} with params: ${params}` });
  
//   const count = parseInt(params) || 1;
//   let delay = 0;
  
//   switch (cmd) {
//     case 'PICK':
//       delay = count * 300; // 150ms on + 150ms off per blink
//       for (let i = 1; i <= count; i++) {
//         setTimeout(() => {
//           broadcastToClients({ type: 'LOG', message: `[SIM] LED blink ${i}/${count} - picking item ${i}` });
//         }, i * 300);
//       }
//       break;
//     case 'PACK':
//       delay = count * 600; // 300ms on + 300ms off per blink
//       for (let i = 1; i <= count; i++) {
//         setTimeout(() => {
//           broadcastToClients({ type: 'LOG', message: `[SIM] LED blink ${i}/${count} - packing item ${i}` });
//         }, i * 600);
//       }
//       break;
//     case 'CONVEYOR':
//       if (params === 'START') {
//         broadcastToClients({ type: 'LOG', message: '[SIM] Conveyor LED pulsing continuously...' });
//         return; // No DONE for conveyor start
//       }
//       delay = 0;
//       break;
//     case 'DELIVER':
//       delay = 3600; // 3 × (800+400)
//       break;
//     case 'COLLECT':
//       delay = count * 1200; // 600ms on + 600ms off
//       break;
//     case 'STATUS':
//       broadcastToClients({ type: 'STATUS', state: 'IDLE', details: 'simulation_mode=true' });
//       return;
//     case 'ESTOP':
//       broadcastToClients({ type: 'LOG', message: '[SIM] !!! EMERGENCY STOP !!!' });
//       broadcastToClients({ type: 'STATUS', state: 'ESTOP', details: 'All operations halted' });
//       return;
//     case 'RESET':
//       broadcastToClients({ type: 'STATUS', state: 'IDLE', details: 'System reset' });
//       broadcastToClients({ type: 'DONE', command: 'RESET' });
//       return;
//     default:
//       delay = 500;
//   }
  
//   setTimeout(() => {
//     broadcastToClients({ type: 'DONE', command: cmd });
//     broadcastToClients({ type: 'LOG', message: `[SIM] ${cmd} complete` });
//   }, delay);
// }

// // ========== SEND TO ARDUINO ==========
// function sendToArduino(command, params) {
//   const fullCmd = params ? `${command}:${params}\n` : `${command}\n`;
  
//   if (simulationMode) {
//     simulateCommand(command, params || '');
//     return;
//   }
  
//   if (!isConnected || !serialPort) {
//     broadcastToClients({ type: 'ERROR', code: 'NO_CONNECTION', message: 'Arduino not connected' });
//     return;
//   }
  
//   console.log(`[WS → ARDUINO] ${fullCmd.trim()}`);
//   serialPort.write(fullCmd, (err) => {
//     if (err) {
//       console.error(`[SERIAL] Write error: ${err.message}`);
//       broadcastToClients({ type: 'ERROR', code: 'WRITE_FAIL', message: err.message });
//     }
//   });
// }

// // ========== WEBSOCKET SERVER ==========
// const wss = new WebSocketServer({ port: WS_PORT });

// wss.on('listening', () => {
//   console.log(`[WS] WebSocket server running on ws://localhost:${WS_PORT}`);
// });

// wss.on('connection', (ws) => {
//   wsClients.add(ws);
//   console.log(`[WS] Client connected (total: ${wsClients.size})`);
  
//   // Send current status to new client
//   ws.send(JSON.stringify({
//     type: 'SYSTEM',
//     message: simulationMode ? 'Connected (simulation mode)' : 'Connected to Arduino',
//     simulationMode,
//     isConnected,
//   }));
  
//   ws.on('message', (data) => {
//     try {
//       const msg = JSON.parse(data.toString());
//       const { command, params } = msg;
      
//       if (!command) {
//         ws.send(JSON.stringify({ type: 'ERROR', code: 'NO_CMD', message: 'Missing command field' }));
//         return;
//       }
      
//       sendToArduino(command.toUpperCase(), params || '');
      
//     } catch (err) {
//       ws.send(JSON.stringify({ type: 'ERROR', code: 'PARSE', message: 'Invalid JSON' }));
//     }
//   });
  
//   ws.on('close', () => {
//     wsClients.delete(ws);
//     console.log(`[WS] Client disconnected (total: ${wsClients.size})`);
//   });
// });

// function broadcastToClients(data) {
//   const json = JSON.stringify(data);
//   for (const client of wsClients) {
//     if (client.readyState === 1) { // OPEN
//       client.send(json);
//     }
//   }
// }

// // ========== STARTUP ==========
// console.log('');
// console.log('╔══════════════════════════════════════════╗');
// console.log('║    AutoShop Serial Bridge Server v1.0    ║');
// console.log('╠══════════════════════════════════════════╣');
// console.log(`║  Serial: ${SERIAL_PATH.padEnd(30)}║`);
// console.log(`║  Baud:   ${String(SERIAL_BAUD).padEnd(30)}║`);
// console.log(`║  WS:     ws://localhost:${String(WS_PORT).padEnd(19)}║`);
// console.log('╚══════════════════════════════════════════╝');
// console.log('');

// connectSerial();

// // ========== GRACEFUL SHUTDOWN ==========
// process.on('SIGINT', () => {
//   console.log('\n[SHUTDOWN] Cleaning up...');
  
//   // Send ESTOP to Arduino on shutdown
//   if (isConnected && serialPort) {
//     serialPort.write('ESTOP\n');
//     setTimeout(() => {
//       serialPort.close();
//       process.exit(0);
//     }, 500);
//   } else {
//     process.exit(0);
//   }
// });






















