import { useEffect, useState } from 'react';
import { X, Download, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { api, PriceHistory, Product } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/utils';

interface PriceHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product;
  token: string;
}

export function PriceHistoryModal({
  isOpen,
  onClose,
  product,
  token,
}: PriceHistoryModalProps) {
  const [history, setHistory] = useState<PriceHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchPriceHistory();
    }
  }, [isOpen]);

  const fetchPriceHistory = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getPriceHistory(token, product.id);
      setHistory(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch price history');
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (history.length === 0) return;

    // CSV headers
    const headers = ['Date', 'User', 'Base Cost', 'Selling Price', 'Margin %', 'Source', 'Reference', 'Notes'];

    // CSV rows
    const rows = history.map(record => [
      new Date(record.created_at).toLocaleString(),
      record.user_full_name || 'System',
      record.base_cost.toFixed(2),
      record.selling_price.toFixed(2),
      record.margin_percentage?.toFixed(1) || '0.0',
      record.source,
      record.reference || '',
      record.notes || ''
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `price-history-${product.sku}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const getSourceBadgeColor = (source: string) => {
    switch (source) {
      case 'receipt':
        return 'bg-green-100 text-green-800';
      case 'adjustment':
        return 'bg-yellow-100 text-yellow-800';
      case 'manual_update':
        return 'bg-blue-100 text-blue-800';
      case 'migration':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getMarginTrendIcon = (currentMargin: number | null, previousMargin: number | null) => {
    if (!currentMargin || !previousMargin) return null;

    const diff = currentMargin - previousMargin;
    if (Math.abs(diff) < 0.1) {
      return <Minus className="w-4 h-4 text-gray-500" />;
    } else if (diff > 0) {
      return <TrendingUp className="w-4 h-4 text-green-600" />;
    } else {
      return <TrendingDown className="w-4 h-4 text-red-600" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold">Price History</h2>
            <p className="text-sm text-gray-600 mt-1">
              {product.name} ({product.sku})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={exportToCSV}
              disabled={history.length === 0}
              className="flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading price history...</p>
              </div>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600">No price history available for this product.</p>
              <p className="text-sm text-gray-500 mt-2">
                Prices will be tracked when you update them via Receive Stock or Edit Product.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Date</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">User</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Base Cost</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Selling Price</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Margin</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Source</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((record, index) => {
                    const previousRecord = index < history.length - 1 ? history[index + 1] : null;
                    const marginTrend = getMarginTrendIcon(
                      record.margin_percentage,
                      previousRecord?.margin_percentage || null
                    );

                    return (
                      <tr key={record.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {new Date(record.created_at).toLocaleDateString()} <br />
                          <span className="text-xs text-gray-500">
                            {new Date(record.created_at).toLocaleTimeString()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {record.user_full_name || 'System'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                          {formatCurrency(record.base_cost)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-primary-600">
                          {formatCurrency(record.selling_price)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {marginTrend}
                            <span
                              className={`text-sm font-medium ${
                                (record.margin_percentage || 0) >= 25
                                  ? 'text-green-600'
                                  : (record.margin_percentage || 0) >= 15
                                  ? 'text-yellow-600'
                                  : 'text-red-600'
                              }`}
                            >
                              {record.margin_percentage?.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSourceBadgeColor(
                              record.source
                            )}`}
                          >
                            {record.source.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {record.reference || '-'}
                          {record.notes && (
                            <div className="text-xs text-gray-500 mt-1">
                              {record.notes}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t bg-gray-50">
          <div className="text-sm text-gray-600">
            {history.length > 0 && (
              <>
                <span className="font-medium">{history.length}</span> price change
                {history.length !== 1 ? 's' : ''} recorded
              </>
            )}
          </div>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
