import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api, Product } from '@/lib/api';
import { useAuth } from './AuthContext';

interface ProductContextType {
  products: Product[];
  isLoading: boolean;
  isRefreshing: boolean;
  lastUpdated: Date | null;
  error: string | null;
  refreshProducts: () => Promise<void>;
}

const ProductContext = createContext<ProductContextType | undefined>(undefined);

const REFRESH_INTERVAL_MS = 30000; // 30 seconds

export function ProductProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const intervalRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  const fetchProducts = useCallback(async (isBackground = false) => {
    if (!token) {
      setProducts([]);
      setIsLoading(false);
      return;
    }

    try {
      if (!isBackground) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setError(null);

      // Filter by user's branch to show only stock at their location
      const data = await api.getProducts(token, undefined, user?.branch_id ?? undefined);

      if (isMountedRef.current) {
        setProducts(data);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error('Failed to fetch products:', err);
      if (isMountedRef.current) {
        setError('Failed to load products');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [token, user?.branch_id]);

  const refreshProducts = useCallback(async () => {
    await fetchProducts(true);
  }, [fetchProducts]);

  // Initial fetch when token changes
  useEffect(() => {
    isMountedRef.current = true;

    if (token) {
      fetchProducts(false);
    } else {
      // Clear cache on logout
      setProducts([]);
      setLastUpdated(null);
      setIsLoading(false);
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [token, fetchProducts]);

  // Background polling with visibility awareness
  useEffect(() => {
    if (!token) return;

    const startPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      intervalRef.current = window.setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchProducts(true);
        }
      }, REFRESH_INTERVAL_MS);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Refresh immediately when tab becomes visible
        fetchProducts(true);
        startPolling();
      } else {
        // Pause polling when tab is hidden
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    };

    // Start polling
    startPolling();

    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [token, fetchProducts]);

  return (
    <ProductContext.Provider value={{
      products,
      isLoading,
      isRefreshing,
      lastUpdated,
      error,
      refreshProducts
    }}>
      {children}
    </ProductContext.Provider>
  );
}

export function useProducts() {
  const context = useContext(ProductContext);
  if (context === undefined) {
    throw new Error('useProducts must be used within a ProductProvider');
  }
  return context;
}
