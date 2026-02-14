import { Clock, ShieldCheck } from 'lucide-react';
import React from 'react';

interface ValidationBadgeProps {
  status: 'validated' | 'in-review' | 'not-validated' | undefined;
  validatedByName?: string;
  validatedAt?: string;
  compact?: boolean;
}

const ValidationBadge: React.FC<ValidationBadgeProps> = ({
  status,
  validatedByName,
  validatedAt,
  compact = false,
}) => {
  if (!status || status === 'not-validated') {
    return null; // Don't show badge for non-validated DMNs
  }

  const config = {
    validated: {
      icon: ShieldCheck,
      label: 'Officieel Gevalideerd',
      shortLabel: 'Gevalideerd',
      bgColor: 'bg-emerald-600',
      textColor: 'text-white',
      borderColor: 'border-emerald-700',
      hoverBg: 'hover:bg-emerald-700',
    },
    'in-review': {
      icon: Clock,
      label: 'In Validatie',
      shortLabel: 'In Review',
      bgColor: 'bg-amber-500',
      textColor: 'text-white',
      borderColor: 'border-amber-600',
      hoverBg: 'hover:bg-amber-600',
    },
  };

  const {
    icon: Icon,
    label,
    shortLabel,
    bgColor,
    textColor,
    borderColor,
    hoverBg,
  } = config[status];

  const formattedDate = validatedAt
    ? new Date(validatedAt).toLocaleDateString('nl-NL', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded shadow-sm border ${bgColor} ${textColor} ${borderColor}`}
        title={`${label}${validatedByName ? ` door ${validatedByName}` : ''}${formattedDate ? ` op ${formattedDate}` : ''}`}
      >
        <Icon size={12} />
        <span className="hidden sm:inline">{shortLabel}</span>
      </span>
    );
  }

  return (
    <div
      className={`inline-flex items-start gap-2 px-3 py-2 text-xs rounded-lg shadow-sm border transition-colors ${bgColor} ${textColor} ${borderColor} ${hoverBg}`}
    >
      <Icon size={16} className="flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <div className="font-semibold">{label}</div>
        {validatedByName && <div className="text-white/90 mt-0.5">door {validatedByName}</div>}
        {formattedDate && <div className="text-white/80 mt-0.5 text-[10px]">{formattedDate}</div>}
      </div>
    </div>
  );
};

export default ValidationBadge;
