import { useState } from 'react';
import { Package } from 'lucide-react';

interface ProductImageProps {
  imageUrl?: string | null;
  productName: string;
  size?: 'thumb' | 'optimized' | 'original';
  className?: string;
}

export function ProductImage({
  imageUrl,
  productName,
  size = 'thumb',
  className = ''
}: ProductImageProps) {
  const [imageError, setImageError] = useState(false);

  // Construct R2 URL with variant suffix
  const getImageUrl = () => {
    if (!imageUrl || imageError) return null;

    const r2BaseUrl = import.meta.env.VITE_R2_PUBLIC_URL || '';
    if (!r2BaseUrl) return null;

    // Add variant suffix to filename
    const suffix = size === 'original' ? '' : `_${size}`;
    const path = imageUrl.replace(/\.(\w+)$/, `${suffix}.$1`);

    return `${r2BaseUrl}/${path}`;
  };

  const finalImageUrl = getImageUrl();

  if (!finalImageUrl) {
    // Show placeholder when no image or error
    return (
      <div
        className={`bg-gray-200 flex items-center justify-center ${className}`}
        title={productName}
      >
        <Package className="w-1/2 h-1/2 text-gray-400" />
      </div>
    );
  }

  return (
    <img
      src={finalImageUrl}
      alt={productName}
      className={className}
      onError={() => setImageError(true)}
      loading="lazy"
    />
  );
}
