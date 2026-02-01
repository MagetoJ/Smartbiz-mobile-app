import { Sale, Tenant } from './api';
import { parseAsUTC } from './utils';

/**
 * Printer Service - Handles direct printing to thermal receipt printers
 * Supports: Bluetooth, USB (Web Serial), and fallback to browser print
 */

// Type declarations for Web Bluetooth and Web Serial APIs
declare global {
  interface Navigator {
    bluetooth?: {
      requestDevice(options: any): Promise<BluetoothDevice>;
    };
    serial?: {
      requestPort(): Promise<any>;
    };
  }
  
  interface BluetoothDevice {
    name?: string;
    gatt?: BluetoothRemoteGATT;
  }
  
  interface BluetoothRemoteGATT {
    connected: boolean;
    connect(): Promise<BluetoothRemoteGATTServer>;
    disconnect(): void;
  }
  
  interface BluetoothRemoteGATTServer {
    getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>;
  }
  
  interface BluetoothRemoteGATTService {
    getCharacteristic(characteristic: string): Promise<BluetoothRemoteGATTCharacteristic>;
  }
  
  interface BluetoothRemoteGATTCharacteristic {
    writeValue(value: BufferSource): Promise<void>;
  }
}

export type PrinterType = 'none' | 'bluetooth' | 'usb' | 'browser';

export interface PrinterConfig {
  type: PrinterType;
  deviceName?: string;
  lastConnected?: string;
}

// ESC/POS Commands
const ESC = '\x1B';
const GS = '\x1D';

class PrinterService {
  private bluetoothDevice: BluetoothDevice | null = null;
  private bluetoothCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private serialPort: any | null = null; // Web Serial API
  private config: PrinterConfig;

  constructor() {
    // Load saved printer config from localStorage
    const saved = localStorage.getItem('printerConfig');
    this.config = saved ? JSON.parse(saved) : { type: 'none' };
  }

  /**
   * Get current printer configuration
   */
  getConfig(): PrinterConfig {
    return { ...this.config };
  }

  /**
   * Check if browser supports Web Bluetooth
   */
  supportsBluetoothPrinting(): boolean {
    return 'bluetooth' in navigator;
  }

  /**
   * Check if browser supports Web Serial (USB printing)
   */
  supportsUSBPrinting(): boolean {
    return 'serial' in navigator;
  }

  /**
   * Connect to a Bluetooth thermal printer
   */
  async connectBluetoothPrinter(): Promise<{ success: boolean; message: string }> {
    if (!this.supportsBluetoothPrinting() || !navigator.bluetooth) {
      return { success: false, message: 'Bluetooth not supported in this browser' };
    }

    try {
      // Request Bluetooth device
      this.bluetoothDevice = await navigator.bluetooth.requestDevice({
        filters: [
          { services: ['000018f0-0000-1000-8000-00805f9b34fb'] }, // Common printer service
        ],
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
      });

      if (!this.bluetoothDevice.gatt) {
        return { success: false, message: 'Device does not support GATT' };
      }

      // Connect to device
      const server = await this.bluetoothDevice.gatt.connect();
      const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      this.bluetoothCharacteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');

      // Save configuration
      this.config = {
        type: 'bluetooth',
        deviceName: this.bluetoothDevice.name || 'Bluetooth Printer',
        lastConnected: new Date().toISOString()
      };
      localStorage.setItem('printerConfig', JSON.stringify(this.config));

      return { 
        success: true, 
        message: `Connected to ${this.bluetoothDevice.name || 'Bluetooth Printer'}` 
      };
    } catch (error: any) {
      console.error('Bluetooth connection error:', error);
      return { 
        success: false, 
        message: error.message || 'Failed to connect to Bluetooth printer' 
      };
    }
  }

  /**
   * Connect to a USB thermal printer (Web Serial API)
   */
  async connectUSBPrinter(): Promise<{ success: boolean; message: string }> {
    if (!this.supportsUSBPrinting()) {
      return { success: false, message: 'USB printing not supported in this browser' };
    }

    try {
      // @ts-ignore - Web Serial API
      this.serialPort = await navigator.serial.requestPort();
      await this.serialPort.open({ baudRate: 9600 });

      // Save configuration
      const info = this.serialPort.getInfo();
      this.config = {
        type: 'usb',
        deviceName: `USB Printer (${info.usbVendorId})`,
        lastConnected: new Date().toISOString()
      };
      localStorage.setItem('printerConfig', JSON.stringify(this.config));

      return { 
        success: true, 
        message: 'Connected to USB Printer' 
      };
    } catch (error: any) {
      console.error('USB connection error:', error);
      return { 
        success: false, 
        message: error.message || 'Failed to connect to USB printer' 
      };
    }
  }

  /**
   * Disconnect from current printer
   */
  async disconnect(): Promise<void> {
    if (this.bluetoothDevice && this.bluetoothDevice.gatt?.connected) {
      await this.bluetoothDevice.gatt.disconnect();
    }
    if (this.serialPort) {
      await this.serialPort.close();
    }
    this.bluetoothDevice = null;
    this.bluetoothCharacteristic = null;
    this.serialPort = null;
    
    this.config = { type: 'none' };
    localStorage.setItem('printerConfig', JSON.stringify(this.config));
  }

  /**
   * Check if printer is currently connected
   */
  isConnected(): boolean {
    if (this.config.type === 'bluetooth') {
      return this.bluetoothDevice?.gatt?.connected || false;
    }
    if (this.config.type === 'usb') {
      return this.serialPort !== null;
    }
    return false;
  }

  /**
   * Generate ESC/POS commands for thermal printer
   */
  private generateESCPOS(sale: Sale, tenant: Tenant): Uint8Array {
    const encoder = new TextEncoder();
    let commands: number[] = [];
    const currency = tenant.currency || 'KES';

    // Helper to add text
    const addText = (text: string) => {
      commands.push(...Array.from(encoder.encode(text)));
    };

    // Helper to add command
    const addCommand = (cmd: string) => {
      commands.push(...Array.from(encoder.encode(cmd)));
    };

    // Initialize printer
    addCommand(`${ESC}@`); // Initialize

    // Center align
    addCommand(`${ESC}a\x01`);

    // Business logo/name - bold
    addCommand(`${ESC}E\x01`); // Bold on
    addText(`${tenant.name}\n`);
    addCommand(`${ESC}E\x00`); // Bold off

    // Address and phone
    if (tenant.address) addText(`${tenant.address}\n`);
    if (tenant.phone) addText(`Tel: ${tenant.phone}\n`);

    // Separator
    addText('--------------------------------\n');

    // Left align for receipt details
    addCommand(`${ESC}a\x00`);

    // Receipt details
    const receiptNumber = `RCPT-${sale.id.toString().padStart(8, '0')}`;
    const date = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: tenant.timezone || 'Africa/Nairobi',
    }).format(parseAsUTC(sale.created_at));
    addText(`Receipt #: ${receiptNumber}\n`);
    addText(`Date: ${date}\n`);
    addText(`Cashier: ${sale.user.full_name}\n`);
    if (sale.customer_name) addText(`Customer: ${sale.customer_name}\n`);

    addText('--------------------------------\n');

    // Items header
    addCommand(`${ESC}E\x01`); // Bold on
    addText('ITEMS\n');
    addCommand(`${ESC}E\x00`); // Bold off

    // Items
    sale.sale_items.forEach(item => {
      addText(`${item.product.name}\n`);
      const lineItem = `  ${item.quantity} x ${currency} ${item.price.toFixed(2)}`;
      const subtotal = `${currency} ${item.subtotal.toFixed(2)}`;
      const padding = 32 - lineItem.length - subtotal.length;
      addText(`${lineItem}${' '.repeat(Math.max(0, padding))}${subtotal}\n`);
    });

    addText('--------------------------------\n');

    // Totals
    const formatLine = (label: string, amount: string) => {
      const padding = 32 - label.length - amount.length;
      return `${label}${' '.repeat(Math.max(0, padding))}${amount}\n`;
    };

    addText(formatLine('Subtotal:', `${currency} ${sale.subtotal.toFixed(2)}`));
    const taxRate = tenant.tax_rate || 0.16;
    addText(formatLine(`VAT (${(taxRate * 100).toFixed(0)}%):`, `${currency} ${sale.tax.toFixed(2)}`));
    
    addText('--------------------------------\n');
    
    // Total - bold only (no double size)
    addCommand(`${ESC}E\x01`); // Bold on
    addText(formatLine('TOTAL:', `${currency} ${sale.total.toFixed(2)}`));
    addCommand(`${ESC}E\x00`); // Bold off

    addText('--------------------------------\n');

    // Payment method
    if (sale.payment_method) {
      addText(`Payment Method: ${sale.payment_method}\n`);
    }

    // Footer
    addCommand(`${ESC}a\x01`); // Center align
    addText('\n');
    addText('Thank you for your business!\n');
    addText('Powered by mBiz\n');
    addText('\n\n');

    // Cut paper
    addCommand(`${GS}V\x00`); // Full cut

    return new Uint8Array(commands);
  }

  /**
   * Print receipt to connected thermal printer
   */
  async printReceipt(sale: Sale, tenant: Tenant): Promise<{ success: boolean; message: string }> {
    // Generate ESC/POS commands
    const escpos = this.generateESCPOS(sale, tenant);

    try {
      if (this.config.type === 'bluetooth' && this.bluetoothCharacteristic) {
        // Check if still connected
        if (!this.bluetoothDevice?.gatt?.connected) {
          return { success: false, message: 'Bluetooth printer disconnected' };
        }

        // Send data in chunks (Bluetooth has size limits)
        const chunkSize = 512;
        for (let i = 0; i < escpos.length; i += chunkSize) {
          const chunk = escpos.slice(i, i + chunkSize);
          await this.bluetoothCharacteristic.writeValue(chunk);
          // Small delay between chunks
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        return { success: true, message: 'Receipt printed successfully' };
      }

      if (this.config.type === 'usb' && this.serialPort) {
        const writer = this.serialPort.writable.getWriter();
        await writer.write(escpos);
        writer.releaseLock();

        return { success: true, message: 'Receipt printed successfully' };
      }

      return { success: false, message: 'No printer connected' };
    } catch (error: any) {
      console.error('Print error:', error);
      return { 
        success: false, 
        message: error.message || 'Failed to print receipt' 
      };
    }
  }

  /**
   * Print test receipt
   */
  async printTestReceipt(): Promise<{ success: boolean; message: string }> {
    const encoder = new TextEncoder();
    let commands: number[] = [];

    const addText = (text: string) => {
      commands.push(...Array.from(encoder.encode(text)));
    };

    const addCommand = (cmd: string) => {
      commands.push(...Array.from(encoder.encode(cmd)));
    };

    // Initialize
    addCommand(`${ESC}@`);
    addCommand(`${ESC}a\x01`); // Center align

    // Test message
    addCommand(`${ESC}E\x01`); // Bold
    addText('TEST PRINT\n');
    addCommand(`${ESC}E\x00`);
    addText('\n');
    addText('If you can read this,\n');
    addText('your printer is working!\n');
    addText('\n');
    addText('StatBricks POS\n');
    addText(new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Africa/Nairobi',
    }).format(new Date()) + '\n');
    addText('\n\n');

    // Cut paper
    addCommand(`${GS}V\x00`);

    const escpos = new Uint8Array(commands);

    try {
      if (this.config.type === 'bluetooth' && this.bluetoothCharacteristic) {
        if (!this.bluetoothDevice?.gatt?.connected) {
          return { success: false, message: 'Bluetooth printer disconnected' };
        }

        const chunkSize = 512;
        for (let i = 0; i < escpos.length; i += chunkSize) {
          const chunk = escpos.slice(i, i + chunkSize);
          await this.bluetoothCharacteristic.writeValue(chunk);
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        return { success: true, message: 'Test print successful' };
      }

      if (this.config.type === 'usb' && this.serialPort) {
        const writer = this.serialPort.writable.getWriter();
        await writer.write(escpos);
        writer.releaseLock();

        return { success: true, message: 'Test print successful' };
      }

      return { success: false, message: 'No printer connected' };
    } catch (error: any) {
      console.error('Test print error:', error);
      return { 
        success: false, 
        message: error.message || 'Test print failed' 
      };
    }
  }

  /**
   * Smart print - tries direct printing, falls back to browser print
   */
  async smartPrint(
    sale: Sale, 
    tenant: Tenant,
    onFallback?: () => void
  ): Promise<{ success: boolean; message: string; usedFallback: boolean }> {
    // If no printer configured or browser print preferred, use browser print
    if (this.config.type === 'none' || this.config.type === 'browser') {
      if (onFallback) onFallback();
      return { 
        success: true, 
        message: 'Opening print dialog...', 
        usedFallback: true 
      };
    }

    // Try direct printing
    const result = await this.printReceipt(sale, tenant);
    
    if (result.success) {
      return { ...result, usedFallback: false };
    }

    // If direct printing failed, fallback to browser print
    console.warn('Direct printing failed, falling back to browser print:', result.message);
    if (onFallback) onFallback();
    
    return { 
      success: true, 
      message: `Printer unavailable. ${result.message}. Opening print dialog...`, 
      usedFallback: true 
    };
  }
}

// Singleton instance
export const printerService = new PrinterService();
