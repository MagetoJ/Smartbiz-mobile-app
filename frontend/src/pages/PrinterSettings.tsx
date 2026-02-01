import { useState, useEffect } from 'react';
import { Printer, Bluetooth, Usb, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { printerService, PrinterConfig } from '@/lib/printerService';

export default function PrinterSettings() {
  const [config, setConfig] = useState<PrinterConfig>(printerService.getConfig());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Check connection status on mount and config change
  useEffect(() => {
    setIsConnected(printerService.isConnected());
  }, [config]);

  const handleConnectBluetooth = async () => {
    setLoading(true);
    setMessage(null);
    
    try {
      const result = await printerService.connectBluetoothPrinter();
      
      if (result.success) {
        setConfig(printerService.getConfig());
        setMessage({ type: 'success', text: result.message });
      } else {
        setMessage({ type: 'error', text: result.message });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to connect' });
    } finally {
      setLoading(false);
    }
  };

  const handleConnectUSB = async () => {
    setLoading(true);
    setMessage(null);
    
    try {
      const result = await printerService.connectUSBPrinter();
      
      if (result.success) {
        setConfig(printerService.getConfig());
        setMessage({ type: 'success', text: result.message });
      } else {
        setMessage({ type: 'error', text: result.message });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to connect' });
    } finally {
      setLoading(false);
    }
  };

  const handleTestPrint = async () => {
    setLoading(true);
    setMessage(null);
    
    try {
      const result = await printerService.printTestReceipt();
      
      if (result.success) {
        setMessage({ type: 'success', text: result.message });
      } else {
        setMessage({ type: 'error', text: result.message });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Test print failed' });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    setMessage(null);
    
    try {
      await printerService.disconnect();
      setConfig(printerService.getConfig());
      setMessage({ type: 'success', text: 'Printer disconnected' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to disconnect' });
    } finally {
      setLoading(false);
    }
  };

  const supportsBluetooth = printerService.supportsBluetoothPrinting();
  const supportsUSB = printerService.supportsUSBPrinting();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <Printer className="h-5 w-5" />
          Receipt Printer
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Configure direct printing to thermal receipt printers
        </p>
      </div>

      {/* Status Message */}
      {message && (
        <div
          className={`px-4 py-3 rounded-lg flex items-start gap-3 ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          )}
          <p className="font-medium text-sm flex-1">{message.text}</p>
        </div>
      )}

      {/* Current Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current Printer</CardTitle>
        </CardHeader>
        <CardContent>
          {config.type === 'none' || config.type === 'browser' ? (
            <div className="text-center py-6">
              <Printer className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="font-medium text-gray-900">No printer configured</p>
              <p className="text-sm text-gray-600 mt-1">
                Connect a thermal receipt printer for faster printing
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                    {config.type === 'bluetooth' ? (
                      <Bluetooth className="w-5 h-5 text-primary-600" />
                    ) : (
                      <Usb className="w-5 h-5 text-primary-600" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{config.deviceName}</p>
                    <p className="text-xs text-gray-500">
                      {config.type === 'bluetooth' ? 'Bluetooth Printer' : 'USB Printer'}
                    </p>
                  </div>
                </div>
                <Badge variant={isConnected ? 'success' : 'warning'}>
                  {isConnected ? 'Connected' : 'Disconnected'}
                </Badge>
              </div>

              {config.lastConnected && (
                <p className="text-xs text-gray-500">
                  Last connected: {new Date(config.lastConnected).toLocaleString()}
                </p>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleTestPrint}
                  disabled={loading || !isConnected}
                  className="flex-1"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Printer className="w-4 h-4 mr-2" />
                      Test Print
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDisconnect}
                  disabled={loading}
                  className="flex-1"
                >
                  Disconnect
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Connection Options */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connect Printer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Bluetooth */}
          <div className="border rounded-lg p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <Bluetooth className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="font-medium text-gray-900">Bluetooth Printer</h3>
                  <p className="text-sm text-gray-600 mt-0.5">
                    Connect wirelessly to Bluetooth thermal printers
                  </p>
                </div>
              </div>
            </div>
            <Button
              onClick={handleConnectBluetooth}
              disabled={loading || !supportsBluetooth}
              variant="outline"
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Bluetooth className="w-4 h-4 mr-2" />
                  Connect Bluetooth
                </>
              )}
            </Button>
            {!supportsBluetooth && (
              <p className="text-xs text-orange-600 mt-2">
                ⚠️ Bluetooth not supported in this browser. Use Chrome or Edge.
              </p>
            )}
          </div>

          {/* USB */}
          <div className="border rounded-lg p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <Usb className="w-5 h-5 text-purple-600" />
                <div>
                  <h3 className="font-medium text-gray-900">USB Printer</h3>
                  <p className="text-sm text-gray-600 mt-0.5">
                    Connect via USB cable (desktop only)
                  </p>
                </div>
              </div>
            </div>
            <Button
              onClick={handleConnectUSB}
              disabled={loading || !supportsUSB}
              variant="outline"
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Usb className="w-4 h-4 mr-2" />
                  Connect USB
                </>
              )}
            </Button>
            {!supportsUSB && (
              <p className="text-xs text-orange-600 mt-2">
                ⚠️ USB printing not supported in this browser. Use Chrome or Edge on desktop.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Help Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Setup Guide</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm text-gray-600">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Bluetooth Printers (Mobile/Tablet)</h4>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Turn on your Bluetooth thermal printer</li>
                <li>Click "Connect Bluetooth" button above</li>
                <li>Select your printer from the list</li>
                <li>Test the connection with a test print</li>
              </ol>
            </div>

            <div>
              <h4 className="font-medium text-gray-900 mb-2">USB Printers (Desktop)</h4>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Connect your USB thermal printer to computer</li>
                <li>Click "Connect USB" button above</li>
                <li>Select your printer from the list</li>
                <li>Test the connection with a test print</li>
              </ol>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
              <p className="text-sm text-blue-900">
                <strong>Note:</strong> Direct printing requires Chrome or Edge browser. 
                If direct printing fails, the system will automatically fall back to 
                the browser's print dialog.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
