import { useState, useRef, useEffect } from 'react';
import { Camera, X, RotateCcw, Check, AlertCircle } from 'lucide-react';

interface CameraCaptureProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

export function CameraCapture({ isOpen, onClose, onCapture }: CameraCaptureProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Initialize camera when modal opens
  useEffect(() => {
    if (!isOpen) {
      // Cleanup when modal closes
      stopCamera();
      setCapturedImage(null);
      setError('');
      setIsLoading(true);
      return;
    }

    // Start camera
    startCamera();

    // Cleanup on unmount
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    setIsLoading(true);
    setError('');

    try {
      // Request camera access
      // Use 'environment' camera (back camera) on mobile, 'user' (front) as fallback
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Prefer back camera
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });

      setStream(mediaStream);

      // Attach stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      setIsLoading(false);
    } catch (err: any) {
      setIsLoading(false);

      // Handle different error types
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Camera access denied. Please allow camera permissions in your browser settings.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError('No camera found on this device.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setError('Camera is already in use by another application.');
      } else {
        setError(`Failed to access camera: ${err.message || 'Unknown error'}`);
      }

      console.error('Camera error:', err);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current video frame to canvas
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert canvas to data URL
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedImage(imageDataUrl);

    // Stop camera stream to save resources
    stopCamera();
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    startCamera();
  };

  const confirmPhoto = () => {
    if (!capturedImage) return;

    // Convert data URL to Blob
    fetch(capturedImage)
      .then(res => res.blob())
      .then(blob => {
        // Create File object from blob
        const file = new File(
          [blob],
          `photo-${Date.now()}.jpg`,
          { type: 'image/jpeg' }
        );

        // Pass file to parent component
        onCapture(file);

        // Close modal
        handleClose();
      })
      .catch(err => {
        console.error('Error converting image:', err);
        setError('Failed to process captured image');
      });
  };

  const handleClose = () => {
    stopCamera();
    setCapturedImage(null);
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="bg-gray-900/90 backdrop-blur-sm p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Camera className="w-6 h-6 text-white" />
          <div>
            <h3 className="text-lg font-semibold text-white">
              {capturedImage ? 'Review Photo' : 'Take Product Photo'}
            </h3>
            <p className="text-sm text-gray-300">
              {capturedImage ? 'Save photo or retake below ↓' : 'Position product in frame'}
            </p>
          </div>
        </div>
        <button
          onClick={handleClose}
          className="p-2 hover:bg-white/10 rounded-full transition-colors"
          aria-label="Close camera"
        >
          <X className="w-6 h-6 text-white" />
        </button>
      </div>

      {/* Camera View / Preview */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-black">
        {/* Error State */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-10 p-6">
            <div className="bg-red-500/20 border border-red-500 rounded-lg p-6 max-w-md">
              <div className="flex items-start gap-3 mb-4">
                <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0" />
                <p className="text-white">{error}</p>
              </div>
              <div className="space-y-2 text-sm text-gray-300 mb-4">
                <p>• Make sure you're using HTTPS (or localhost)</p>
                <p>• Allow camera permissions when prompted</p>
                <p>• Check that your camera is not in use by another app</p>
              </div>
              <button
                onClick={handleClose}
                className="bg-white text-gray-900 w-full py-2 px-4 rounded-md hover:bg-gray-100 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && !error && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-white mb-2">Initializing camera...</p>
              <p className="text-sm text-gray-400">Allow camera permissions if prompted</p>
            </div>
          </div>
        )}

        {/* Live Video Stream */}
        {!capturedImage && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="max-w-full max-h-full object-contain"
            style={{ display: error || isLoading ? 'none' : 'block' }}
          />
        )}

        {/* Captured Photo Preview */}
        {capturedImage && (
          <img
            src={capturedImage}
            alt="Captured product"
            className="max-w-full max-h-full object-contain"
          />
        )}

        {/* Hidden Canvas for capturing */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Capture Grid Overlay (optional - helps with framing) */}
        {!capturedImage && !error && !isLoading && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="w-full h-full grid grid-cols-3 grid-rows-3">
              {[...Array(9)].map((_, i) => (
                <div key={i} className="border border-white/20"></div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons - Fixed at bottom */}
      <div className="bg-gray-900 border-t border-white/20 p-6 pb-20 min-h-[180px] flex items-center justify-center safe-area-bottom">
        {!capturedImage ? (
          // Capture Mode
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={capturePhoto}
              disabled={!stream || !!error || isLoading}
              className="w-20 h-20 rounded-full bg-white hover:bg-gray-100 text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors shadow-lg"
            >
              <Camera className="w-8 h-8" />
            </button>
            <p className="text-sm text-gray-300 text-center">
              Tap to capture product photo
            </p>
          </div>
        ) : (
          // Review Mode - Large visible buttons
          <div className="flex gap-3 justify-center w-full px-4">
            <button
              onClick={retakePhoto}
              className="flex-1 max-w-[200px] bg-gray-700 text-white border-2 border-gray-500 hover:bg-gray-600 py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 font-semibold shadow-lg"
            >
              <RotateCcw className="w-5 h-5" />
              Retake
            </button>
            <button
              onClick={confirmPhoto}
              className="flex-1 max-w-[200px] bg-green-600 hover:bg-green-700 text-white py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 font-semibold shadow-lg border-2 border-green-400"
            >
              <Check className="w-6 h-6" />
              Save Photo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
