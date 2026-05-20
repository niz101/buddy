/**
 * AutoShop Hardware Bridge Client
 * ================================
 * 
 * Connects the web app to the Arduino via the serial-bridge WebSocket.
 * Each method corresponds to a robot capability.
 * NO business logic lives here - only hardware communication.
 * 
 * Usage:
 *   import { hardwareBridge } from '@/lib/hardwarebridge';
 *   
 *   hardwareBridge.connect();
 *   hardwareBridge.pick(3);
 *   hardwareBridge.onMessage((msg) => console.log(msg));
 */

export interface HardwareMessage {
  type: 'ACK' | 'DONE' | 'STATUS' | 'ERROR' | 'LOG' | 'SYSTEM' | 'RAW';
  command?: string;
  data?: string;
  state?: string;
  details?: string;
  code?: string;
  message?: string;
  simulationMode?: boolean;
  isConnected?: boolean;
}

type MessageHandler = (msg: HardwareMessage) => void;

class HardwareBridge {
  private ws: WebSocket | null = null;
  private listeners: MessageHandler[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _isConnected = false;
  private _simulationMode = true;
  private wsUrl: string;

  constructor(wsUrl: string = 'ws://localhost:8765') {
    this.wsUrl = wsUrl;
  }

  get isConnected() { return this._isConnected; }
  get simulationMode() { return this._simulationMode; }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        this._isConnected = true;
        console.log('[HW Bridge] Connected to serial bridge');
        this.notify({ type: 'SYSTEM', message: 'Bridge connected' });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: HardwareMessage = JSON.parse(event.data);
          if (msg.simulationMode !== undefined) {
            this._simulationMode = msg.simulationMode;
          }
          this.notify(msg);
        } catch {
          this.notify({ type: 'RAW', message: event.data });
        }
      };

      this.ws.onclose = () => {
        this._isConnected = false;
        console.log('[HW Bridge] Disconnected');
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this._isConnected = false;
        // Silently fall back - the app works without hardware
      };
    } catch {
      // WebSocket not available or bridge not running
      this._isConnected = false;
      this._simulationMode = true;
    }
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this._isConnected = false;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), 5000);
  }

  private send(command: string, params?: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ command, params }));
    } else {
      // Log but don't break - system works without hardware
      console.log(`[HW Bridge] Would send: ${command}:${params || ''} (not connected)`);
    }
  }

  private notify(msg: HardwareMessage) {
    this.listeners.forEach(fn => fn(msg));
  }

  // ========== EVENT LISTENERS ==========
  onMessage(handler: MessageHandler) {
    this.listeners.push(handler);
    return () => {
      this.listeners = this.listeners.filter(fn => fn !== handler);
    };
  }

  // Wait for a specific DONE command with timeout
  waitForDone(command: string, timeoutMs: number = 30000): Promise<HardwareMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsub();
        reject(new Error(`Timeout waiting for DONE:${command}`));
      }, timeoutMs);

      const unsub = this.onMessage((msg) => {
        if (msg.type === 'DONE' && msg.command === command) {
          clearTimeout(timer);
          unsub();
          resolve(msg);
        }
        if (msg.type === 'ERROR') {
          clearTimeout(timer);
          unsub();
          reject(new Error(msg.message || 'Hardware error'));
        }
      });
    });
  }

  // ========== ROBOT CAPABILITIES ==========

  /** Blink LED fast × count to simulate picking items from shelves */
  pick(count: number) {
    this.send('PICK', String(count));
  }

  /** Blink LED medium × count to simulate packing items */
  pack(count: number) {
    this.send('PACK', String(count));
  }

  /** Start continuous conveyor LED pulse */
  conveyorStart() {
    this.send('CONVEYOR', 'START');
  }

  /** Stop conveyor LED pulse */
  conveyorStop() {
    this.send('CONVEYOR', 'STOP');
  }

  /** 3 long blinks - items reached delivery window */
  deliver() {
    this.send('DELIVER');
  }

  /** Slow blinks × count - customer collecting items */
  collect(count: number) {
    this.send('COLLECT', String(count));
  }

  /** Request current Arduino status */
  status() {
    this.send('STATUS');
  }

  /** Emergency stop - halts all operations immediately */
  emergencyStop() {
    this.send('ESTOP');
  }

  /** Reset Arduino to idle state after ESTOP or error */
  reset() {
    this.send('RESET');
  }

  /** Heartbeat check */
  heartbeat() {
    this.send('HEARTBEAT');
  }
}

// Singleton instance
export const hardwareBridge = new HardwareBridge();
