import { useState, useEffect, useRef } from 'react';
import { X, Camera, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Html5Qrcode } from 'html5-qrcode';

interface BarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
}

export function BarcodeScanner({ isOpen, onClose, onScan }: BarcodeScannerProps) {
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const elementIdRef = useRef('barcode-scanner-element');

  useEffect(() => {
    if (!isOpen) {
      // Cleanup when closing
      if (scannerRef.current && isScanning) {
        scannerRef.current
          .stop()
          .then(() => {
            scannerRef.current?.clear();
            scannerRef.current = null;
          })
          .catch((err) => {
            console.error('Error stopping scanner:', err);
            scannerRef.current = null;
          });
      }
      setError('');
      setIsLoading(true);
      setIsScanning(false);
      return;
    }

    // Initialize scanner when modal opens
    const initScanner = async () => {
      setIsLoading(true);
      setError('');

      try {
        // Wait for DOM element to be ready with retry logic
        let element = null;
        let retries = 0;
        const maxRetries = 10;

        while (!element && retries < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 100));
          element = document.getElementById(elementIdRef.current);
          retries++;
        }

        if (!element) {
          throw new Error('Scanner element not found after retries');
        }

        // Defensive check: ensure element exists before creating scanner
        if (!document.getElementById(elementIdRef.current)) {
          throw new Error('Scanner element not found in DOM');
        }

        const scanner = new Html5Qrcode(elementIdRef.current);
        scannerRef.current = scanner;

        const config = {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        };

        await scanner.start(
          { facingMode: 'environment' }, // Use back camera
          config,
          (decodedText: string) => {
            // Success - barcode scanned
            console.log('Barcode scanned:', decodedText);

            // Stop scanner
            if (scannerRef.current) {
              scannerRef.current
                .stop()
                .then(() => {
                  scannerRef.current?.clear();
                  scannerRef.current = null;
                  setIsScanning(false);
                  // Defensive check: ensure onScan callback exists
                  if (typeof onScan === 'function') {
                    onScan(decodedText);
                  } else {
                    console.error('onScan is not a function:', onScan);
                  }
                })
                .catch((err) => {
                  console.error('Error stopping scanner:', err);
                  if (typeof onScan === 'function') {
                    onScan(decodedText);
                  }
                });
            } else {
              if (typeof onScan === 'function') {
                onScan(decodedText);
              }
            }
          },
          (errorMessage: string) => {
            // This is called repeatedly when no barcode is found - ignore
            // Only log if it's an actual error
            if (!errorMessage.includes('No MultiFormat Readers')) {
              console.debug('Scan attempt:', errorMessage);
            }
          }
        );

        setIsScanning(true);
        setIsLoading(false);
      } catch (err: any) {
        console.error('Failed to initialize scanner:', err);
        let errorMsg = 'Failed to access camera. ';
        
        if (err.name === 'NotAllowedError' || err.message?.includes('Permission')) {
          errorMsg += 'Please grant camera permissions in your browser settings.';
        } else if (err.name === 'NotFoundError') {
          errorMsg += 'No camera found on this device.';
        } else if (err.message?.includes('secure context') || err.message?.includes('HTTPS')) {
          errorMsg += 'Camera requires HTTPS connection.';
        } else {
          errorMsg += err.message || 'Please check your camera and permissions.';
        }
        
        setError(errorMsg);
        setIsLoading(false);
      }
    };

    if (isOpen) {
      initScanner();
    }

    // Cleanup on unmount
    return () => {
      if (scannerRef.current) {
        try {
          // Check if scanner is still scanning before stopping
          if (scannerRef.current.isScanning) {
            scannerRef.current
              .stop()
              .then(() => {
                scannerRef.current?.clear();
                scannerRef.current = null;
              })
              .catch((err) => {
                // Don't throw - just log and continue cleanup
                console.error('Error stopping scanner:', err);
              })
              .finally(() => {
                // Always reset state
                scannerRef.current = null;
                setIsScanning(false);
              });
          } else {
            // Scanner exists but not scanning - just clear it
            scannerRef.current.clear();
            scannerRef.current = null;
            setIsScanning(false);
          }
        } catch (err) {
          console.error('Error in cleanup:', err);
          scannerRef.current = null;
          setIsScanning(false);
        }
      } else {
        // Even if scanner is null, ensure state is reset
        setIsScanning(false);
      }
    };
  }, [isOpen]);

  const handleClose = () => {
    if (scannerRef.current && isScanning) {
      scannerRef.current
        .stop()
        .then(() => {
          scannerRef.current?.clear();
          scannerRef.current = null;
          setIsScanning(false);
          onClose();
        })
        .catch(() => {
          onClose();
        });
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="bg-gray-900/90 backdrop-blur-sm p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Camera className="w-6 h-6 text-white" />
          <div>
            <h3 className="text-lg font-semibold text-white">Scan Barcode</h3>
            <p className="text-sm text-gray-300">Point camera at product barcode</p>
          </div>
        </div>
        <button
          onClick={handleClose}
          className="p-2 hover:bg-white/10 rounded-full transition-colors"
          aria-label="Close scanner"
        >
          <X className="w-6 h-6 text-white" />
        </button>
      </div>

      {/* Scanner Area */}
      <div className="flex-1 relative flex items-center justify-center overflow-auto p-4">
        {/* Error State */}
        {error && (
          <div className="text-center p-6 max-w-md absolute inset-0 flex items-center justify-center z-10">
            <div className="bg-red-500/20 border border-red-500 rounded-lg p-6">
              <p className="text-white mb-4">{error}</p>
              <div className="space-y-2 text-sm text-gray-300 mb-4">
                <p>• Make sure you're using HTTPS (or localhost)</p>
                <p>• Allow camera permissions when prompted</p>
                <p>• Check that your camera is not in use by another app</p>
              </div>
              <Button onClick={handleClose} variant="outline" className="bg-white text-gray-900">
                Close
              </Button>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && !error && (
          <div className="text-center absolute inset-0 flex items-center justify-center z-10">
            <div>
              <Loader2 className="w-12 h-12 text-white animate-spin mx-auto mb-4" />
              <p className="text-white mb-2">Initializing camera...</p>
              <p className="text-sm text-gray-400">Allow camera permissions if prompted</p>
            </div>
          </div>
        )}

        {/* Scanner Container - Always rendered */}
        <div className="w-full max-w-2xl" style={{ visibility: (error || isLoading) ? 'hidden' : 'visible' }}>
          {/* Scanner container */}
          <div id={elementIdRef.current} className="barcode-scanner-container rounded-lg overflow-hidden"></div>

          {isScanning && (
            <div className="mt-4 text-center">
              <div className="inline-flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-white text-sm">Scanning... Point at barcode</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-gray-900/90 backdrop-blur-sm p-4">
        <div className="max-w-md mx-auto space-y-2">
          <p className="text-sm text-gray-300 text-center">
            📱 Keep camera steady and ensure good lighting
          </p>
          <p className="text-sm text-gray-300 text-center">
            Supported: EAN-13, UPC-A, Code 128, QR Code
          </p>
        </div>
      </div>

      {/* Custom styles */}
      <style>{`
        #${elementIdRef.current} {
          width: 100%;
        }
        
        #${elementIdRef.current} video {
          border-radius: 12px;
          width: 100% !important;
          max-height: 60vh;
          object-fit: cover;
        }
        
        #${elementIdRef.current} canvas {
          display: none;
        }
        
        #${elementIdRef.current}__scan_region {
          border: 2px solid #3b82f6 !important;
          border-radius: 8px;
        }
        
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
}
