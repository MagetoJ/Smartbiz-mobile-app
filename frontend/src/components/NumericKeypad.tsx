import { useEffect, useState } from 'react';
import { X, Delete } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface NumericKeypadProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: number) => void;
  initialValue?: number;
  allowDecimal?: boolean;
  label?: string;
  min?: number;
  max?: number;
}

export function NumericKeypad({
  isOpen,
  onClose,
  onSubmit,
  initialValue = 0,
  allowDecimal = false,
  label = 'Enter Value',
  min,
  max,
}: NumericKeypadProps) {
  const [displayValue, setDisplayValue] = useState(initialValue.toString());
  const [hasDecimal, setHasDecimal] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDisplayValue(initialValue.toString());
      setHasDecimal(initialValue.toString().includes('.'));
    }
  }, [isOpen, initialValue]);

  const handleNumberClick = (num: string) => {
    if (displayValue === '0' && num !== '.') {
      setDisplayValue(num);
    } else {
      setDisplayValue(displayValue + num);
    }
  };

  const handleDecimalClick = () => {
    if (allowDecimal && !hasDecimal) {
      setDisplayValue(displayValue + '.');
      setHasDecimal(true);
    }
  };

  const handleBackspace = () => {
    if (displayValue.length === 1) {
      setDisplayValue('0');
      setHasDecimal(false);
    } else {
      const newValue = displayValue.slice(0, -1);
      setDisplayValue(newValue);
      setHasDecimal(newValue.includes('.'));
    }
  };

  const handleClear = () => {
    setDisplayValue('0');
    setHasDecimal(false);
  };

  const handleDone = () => {
    let value = parseFloat(displayValue) || 0;

    // Apply min/max constraints
    if (min !== undefined && value < min) value = min;
    if (max !== undefined && value > max) value = max;

    onSubmit(value);
    onClose();
  };

  const handleCancel = () => {
    setDisplayValue(initialValue.toString());
    setHasDecimal(initialValue.toString().includes('.'));
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end lg:items-center lg:justify-center">
      <div
        className="w-full lg:max-w-md bg-white rounded-t-3xl lg:rounded-2xl shadow-2xl animate-in slide-in-from-bottom lg:slide-in-from-bottom-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{label}</h3>
          <button
            onClick={handleCancel}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Display */}
        <div className="p-6 bg-gray-50">
          <div className="bg-white rounded-xl p-4 border-2 border-primary-200">
            <div className="text-right">
              <div className="text-4xl font-bold text-gray-900 min-h-[3rem] flex items-center justify-end">
                {displayValue}
              </div>
            </div>
          </div>
        </div>

        {/* Keypad */}
        <div className="p-4">
          <div className="grid grid-cols-3 gap-3 mb-3">
            {/* Number buttons 1-9 */}
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                onClick={() => handleNumberClick(num.toString())}
                className="h-16 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 rounded-xl text-2xl font-semibold text-gray-900 transition-colors touch-none select-none"
              >
                {num}
              </button>
            ))}

            {/* Bottom row: Decimal/Clear, 0, Backspace */}
            <button
              onClick={allowDecimal ? handleDecimalClick : handleClear}
              className="h-16 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 rounded-xl text-xl font-semibold text-gray-700 transition-colors touch-none select-none"
              disabled={allowDecimal && hasDecimal}
            >
              {allowDecimal ? '.' : 'C'}
            </button>

            <button
              onClick={() => handleNumberClick('0')}
              className="h-16 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 rounded-xl text-2xl font-semibold text-gray-900 transition-colors touch-none select-none"
            >
              0
            </button>

            <button
              onClick={handleBackspace}
              className="h-16 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 rounded-xl flex items-center justify-center transition-colors touch-none select-none"
              aria-label="Backspace"
            >
              <Delete className="w-6 h-6 text-gray-700" />
            </button>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              size="lg"
              onClick={handleCancel}
              className="h-14 text-base"
            >
              Cancel
            </Button>
            <Button
              size="lg"
              onClick={handleDone}
              className="h-14 text-base bg-primary-600 hover:bg-primary-700"
            >
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
