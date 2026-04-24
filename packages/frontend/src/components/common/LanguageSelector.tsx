// packages/frontend/src/components/common/LanguageSelector.tsx
import { Globe } from 'lucide-react';
import React from 'react';

export type LanguageCode = 'en' | 'nl' | 'de';

/** Display metadata for each supported language. Order here drives dropdown order. */
// eslint-disable-next-line react-refresh/only-export-components
export const LANGUAGE_OPTIONS: { code: LanguageCode; label: string; nativeLabel: string }[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'nl', label: 'Dutch', nativeLabel: 'Nederlands' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch' },
];

interface LanguageSelectorProps {
  /** Currently selected language code, or undefined for language-agnostic. */
  currentLanguage: LanguageCode | undefined;
  /** Called with the new code, or undefined when cleared. */
  onLanguageChange: (language: LanguageCode | undefined) => void;
  /** Disable the dropdown (e.g. for readonly example artefacts). */
  disabled?: boolean;
}

const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  currentLanguage,
  onLanguageChange,
  disabled = false,
}) => {
  const handleChange = (value: string) => {
    onLanguageChange(value === '' ? undefined : (value as LanguageCode));
  };

  return (
    <div className="p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Globe size={12} className="text-indigo-600 shrink-0" />
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          Language
        </span>
      </div>

      <select
        value={currentLanguage ?? ''}
        onChange={(e) => handleChange(e.target.value)}
        disabled={disabled}
        className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs
                   focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white
                   disabled:opacity-50"
      >
        <option value="">— Language-agnostic —</option>
        {LANGUAGE_OPTIONS.map((opt) => (
          <option key={opt.code} value={opt.code}>
            {opt.label} ({opt.nativeLabel})
          </option>
        ))}
      </select>

      {!currentLanguage && (
        <p className="mt-1 text-[10px] text-slate-500">
          Untagged artefacts match every language filter.
        </p>
      )}
    </div>
  );
};

export default LanguageSelector;
