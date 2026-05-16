// packages/frontend/src/components/common/OrganizationSelector.tsx
import { Building2 } from 'lucide-react';
import React, { useId } from 'react';

interface OrganizationSelectorProps {
  /** Currently set organization, or undefined for unset. */
  currentOrganization: string | undefined;
  /** Called with the new value, or undefined when cleared. */
  onOrganizationChange: (organization: string | undefined) => void;
  /** Known organization keys for autocomplete — usually derived from the list of artefacts. */
  suggestions?: string[];
  /** Disable the input (e.g. for readonly example artefacts). */
  disabled?: boolean;
}

const OrganizationSelector: React.FC<OrganizationSelectorProps> = ({
  currentOrganization,
  onOrganizationChange,
  suggestions = [],
  disabled = false,
}) => {
  const listId = useId();

  const handleChange = (value: string) => {
    onOrganizationChange(value === '' ? undefined : value);
  };

  return (
    <div className="p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Building2 size={12} className="text-emerald-600 shrink-0" />
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          Organization
        </span>
      </div>

      <input
        type="text"
        list={listId}
        value={currentOrganization ?? ''}
        onChange={(e) => handleChange(e.target.value)}
        disabled={disabled}
        placeholder="e.g. flevoland"
        className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs
                   focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white
                   disabled:opacity-50"
      />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {!currentOrganization && (
        <p className="mt-1 text-[10px] text-slate-500">Unset artefacts appear under “Ungrouped”.</p>
      )}
    </div>
  );
};

export default OrganizationSelector;
