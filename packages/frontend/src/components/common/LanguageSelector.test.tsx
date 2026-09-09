// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import LanguageSelector, { LANGUAGE_OPTIONS } from './LanguageSelector';

describe('LanguageSelector', () => {
  test('renders every language option plus the language-agnostic default', () => {
    render(<LanguageSelector currentLanguage={undefined} onLanguageChange={vi.fn()} />);

    expect(screen.getByRole('combobox')).toHaveValue('');
    for (const opt of LANGUAGE_OPTIONS) {
      expect(
        screen.getByRole('option', { name: `${opt.label} (${opt.nativeLabel})` })
      ).toBeTruthy();
    }
  });

  test('shows the "matches every filter" hint only when no language is set', () => {
    const { rerender } = render(
      <LanguageSelector currentLanguage={undefined} onLanguageChange={vi.fn()} />
    );
    expect(screen.getByText(/match every language filter/i)).toBeTruthy();

    rerender(<LanguageSelector currentLanguage="nl" onLanguageChange={vi.fn()} />);
    expect(screen.queryByText(/match every language filter/i)).toBeNull();
  });

  test('calls onLanguageChange with the selected code', async () => {
    const onLanguageChange = vi.fn();
    render(<LanguageSelector currentLanguage={undefined} onLanguageChange={onLanguageChange} />);

    await userEvent.selectOptions(screen.getByRole('combobox'), 'nl');
    expect(onLanguageChange).toHaveBeenCalledWith('nl');
  });

  test('calls onLanguageChange with undefined when cleared back to the default option', async () => {
    const onLanguageChange = vi.fn();
    render(<LanguageSelector currentLanguage="nl" onLanguageChange={onLanguageChange} />);

    await userEvent.selectOptions(screen.getByRole('combobox'), '— Language-agnostic —');
    expect(onLanguageChange).toHaveBeenCalledWith(undefined);
  });

  test('disables the dropdown when disabled is true', () => {
    render(<LanguageSelector currentLanguage={undefined} onLanguageChange={vi.fn()} disabled />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});
