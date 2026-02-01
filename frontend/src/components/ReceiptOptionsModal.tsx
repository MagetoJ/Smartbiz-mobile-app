import { useEffect, useState } from 'react';
import { X, Mail, MessageCircle, Printer, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/utils';

interface ReceiptOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  saleId: number;
  total: number;
  paymentMethod: string;
  itemCount: number;
}

export function ReceiptOptionsModal({
  isOpen,
  onClose,
  saleId,
  total,
  paymentMethod,
  itemCount,
}: ReceiptOptionsModalProps) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [autoCloseTimer, setAutoCloseTimer] = useState<NodeJS.Timeout | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(5);

  useEffect(() => {
    if (isOpen) {
      // Reset timer
      setSecondsRemaining(5);

      // Start countdown
      const countdownInterval = setInterval(() => {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Auto-close after 5 seconds
      const timer = setTimeout(() => {
        onClose();
      }, 5000);

      setAutoCloseTimer(timer);

      return () => {
        if (timer) clearTimeout(timer);
        clearInterval(countdownInterval);
      };
    }
  }, [isOpen, onClose]);

  const handleUserAction = () => {
    // Cancel auto-close when user interacts
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      setAutoCloseTimer(null);
      setSecondsRemaining(0);
    }
  };

  const handleEmailReceipt = () => {
    handleUserAction();
    if (!email) {
      alert('Please enter an email address');
      return;
    }
    // TODO: Implement email receipt via API
    console.log('Send receipt to email:', email);
    alert(`Receipt sent to ${email}`);
    onClose();
  };

  const handleWhatsAppReceipt = () => {
    handleUserAction();
    const message = `✅ Receipt #${saleId}\n\n📋 ${itemCount} item${itemCount > 1 ? 's' : ''}\n💰 Total: ${formatCurrency(total)}\n💳 Payment: ${paymentMethod}\n\nThank you for your purchase!`;
    const encodedMessage = encodeURIComponent(message);

    if (phone) {
      // Send to specific number
      const cleanPhone = phone.replace(/\D/g, '');
      window.open(`https://wa.me/${cleanPhone}?text=${encodedMessage}`, '_blank');
    } else {
      // Open WhatsApp with pre-filled message
      window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
    }
    onClose();
  };

  const handlePrintReceipt = () => {
    handleUserAction();
    // TODO: Implement print receipt
    console.log('Print receipt:', saleId);
    window.print();
    onClose();
  };

  const handleSkip = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end lg:items-center lg:justify-center">
      <div
        className="w-full lg:max-w-lg bg-white rounded-t-3xl lg:rounded-2xl shadow-2xl animate-in slide-in-from-bottom lg:slide-in-from-bottom-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Sale Complete!</h3>
              <p className="text-sm text-gray-600">Receipt #{saleId}</p>
            </div>
          </div>
          <button
            onClick={handleSkip}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Sale Summary */}
        <div className="p-6 bg-gray-50 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-600">{itemCount} item{itemCount > 1 ? 's' : ''}</p>
              <p className="text-sm text-gray-600">Payment: {paymentMethod}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-primary-600">{formatCurrency(total)}</p>
            </div>
          </div>
        </div>

        {/* Receipt Options */}
        <div className="p-6 space-y-4">
          <p className="text-sm font-medium text-gray-700">Send receipt to customer:</p>

          {/* Email Option */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="customer@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  handleUserAction();
                }}
                className="flex-1"
              />
              <Button
                onClick={handleEmailReceipt}
                disabled={!email}
                className="bg-blue-600 hover:bg-blue-700 min-w-[100px]"
              >
                <Mail className="w-4 h-4 mr-2" />
                Email
              </Button>
            </div>
          </div>

          {/* WhatsApp Option */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                type="tel"
                placeholder="254712345678 (optional)"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  handleUserAction();
                }}
                className="flex-1"
              />
              <Button
                onClick={handleWhatsAppReceipt}
                className="bg-green-600 hover:bg-green-700 min-w-[120px]"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                WhatsApp
              </Button>
            </div>
          </div>

          {/* Print & Skip */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              variant="outline"
              onClick={handlePrintReceipt}
              className="h-12"
            >
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
            <Button
              variant="outline"
              onClick={handleSkip}
              className="h-12"
            >
              {secondsRemaining > 0 ? `Skip (${secondsRemaining}s)` : 'Skip'}
            </Button>
          </div>
        </div>

        {/* Auto-close indicator */}
        {secondsRemaining > 0 && (
          <div className="px-6 pb-4">
            <div className="w-full bg-gray-200 rounded-full h-1 overflow-hidden">
              <div
                className="bg-primary-600 h-full transition-all duration-1000 ease-linear"
                style={{ width: `${(secondsRemaining / 5) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
