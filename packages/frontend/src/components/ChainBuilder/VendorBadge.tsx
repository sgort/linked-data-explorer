import { Building2 } from 'lucide-react';
import React from 'react';

interface VendorBadgeProps {
  count: number;
  onClick?: (e?: React.MouseEvent) => void; // Changed to accept optional event
  compact?: boolean;
}

const VendorBadge: React.FC<VendorBadgeProps> = ({ count, onClick, compact = false }) => {
  // Don't render if count is 0 or undefined
  if (!count || count === 0) {
    return null;
  }

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      onClick(e); // Pass the event through
    }
  };

  if (compact) {
    return (
      <button
        onClick={handleClick}
        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded shadow-sm border bg-blue-600 text-white border-blue-700 hover:bg-blue-700 transition-colors"
        title={`${count} vendor implementation${count !== 1 ? 's' : ''} available`}
      >
        <Building2 size={12} />
        <span>{count}</span>
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-start gap-2 px-3 py-2 text-xs rounded-lg shadow-sm border transition-colors bg-blue-600 text-white border-blue-700 hover:bg-blue-700"
    >
      <Building2 size={16} className="flex-shrink-0 mt-0.5" />
      <div className="flex-1 text-left">
        <div className="font-semibold">
          {count} Vendor Implementation{count !== 1 ? 's' : ''}
        </div>
        <div className="text-white/90 mt-0.5">Click to view details</div>
      </div>
    </button>
  );
};

export default VendorBadge;
