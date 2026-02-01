import { useState } from 'react';
import { Building2 } from 'lucide-react';

interface BusinessLogoProps {
  logoUrl: string | null | undefined;
  businessName: string;
  size?: 'original' | 'display';
  className?: string;
}

export function BusinessLogo({
  logoUrl,
  businessName,
  size = 'display',
  className = ''
}: BusinessLogoProps) {
  const [imageError, setImageError] = useState(false);

  // Construct R2 URL with variant suffix
  const getLogoUrl = () => {
    if (!logoUrl || imageError) return null;

    const r2BaseUrl = import.meta.env.VITE_R2_PUBLIC_URL || '';
    if (!r2BaseUrl) {
      // Fallback to local uploads for old logos
      return `/api/uploads/${logoUrl}`;
    }

    // Add variant suffix to filename (unless original)
    const suffix = size === 'original' ? '' : '_display';
    const path = logoUrl.replace(/\.(\w+)$/, `${suffix}.$1`);

    return `${r2BaseUrl}/${path}`;
  };

  const finalLogoUrl = getLogoUrl();

  if (!finalLogoUrl) {
    // Show placeholder when no logo or error
    return (
      <div className={`bg-primary-100 flex items-center justify-center rounded ${className}`}>
        <Building2 className="w-1/2 h-1/2 text-primary-600" />
      </div>
    );
  }

  return (
    <img
      src={finalLogoUrl}
      alt={`${businessName} logo`}
      className={className}
      onError={() => setImageError(true)}
      loading="lazy"
    />
  );
}
