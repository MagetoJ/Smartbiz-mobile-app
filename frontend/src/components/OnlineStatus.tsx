import { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

export function OnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showOfflineBanner, setShowOfflineBanner] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowOfflineBanner(false);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowOfflineBanner(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-hide online notification after 3 seconds
  useEffect(() => {
    if (isOnline && !showOfflineBanner) {
      const timer = setTimeout(() => {
        setShowOfflineBanner(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, showOfflineBanner]);

  if (!showOfflineBanner && isOnline) {
    return null;
  }

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 ${
        isOnline ? 'bg-green-600' : 'bg-red-600'
      } text-white py-2 px-4 text-center text-sm font-medium shadow-lg animate-in slide-in-from-top-2`}
    >
      <div className="flex items-center justify-center gap-2">
        {isOnline ? (
          <>
            <Wifi className="w-4 h-4" />
            <span>Back online</span>
          </>
        ) : (
          <>
            <WifiOff className="w-4 h-4" />
            <span>You're offline - Some features may be limited</span>
          </>
        )}
      </div>
    </div>
  );
}
