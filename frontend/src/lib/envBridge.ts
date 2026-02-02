/**
 * Detects the current running environment and provides the appropriate API base URL.
 */

export enum AppEnvironment {
  WEB = 'web',
  MOBILE = 'mobile',
  DESKTOP = 'desktop'
}

export const getAppEnvironment = (): AppEnvironment => {
  // @ts-ignore - Check for React Native
  if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
    return AppEnvironment.MOBILE;
  }
  
  // @ts-ignore - Check for Electron
  if (typeof window !== 'undefined' && window.process && (window.process as any).type === 'renderer') {
    return AppEnvironment.DESKTOP;
  }

  return AppEnvironment.WEB;
};

export const getApiBaseUrl = (): string => {
  const env = getAppEnvironment();

  switch (env) {
    case AppEnvironment.DESKTOP:
      // Local backend bundled with Electron
      return 'http://localhost:8000';
    
    case AppEnvironment.MOBILE:
      // Remote backend or local network for testing
      return process.env.API_BASE_URL || 'https://api.statbricks.com';
    
    case AppEnvironment.WEB:
    default:
      // Standard web environment
      if (typeof window !== 'undefined' && (window as any).__RUNTIME_CONFIG__?.API_URL) {
        return (window as any).__RUNTIME_CONFIG__.API_URL;
      }
      return import.meta.env.VITE_API_URL || 'http://localhost:8000';
  }
};

export const API_BASE_URL = getApiBaseUrl();
