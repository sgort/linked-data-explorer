/**
 * ExportChain Component
 * Provides UI for exporting chains in various formats
 */

import { Download, FileJson, FileText, X } from 'lucide-react';
import React, { useState } from 'react';

import { DmnModel } from '../../types';
import { ChainValidation } from '../../types/chainBuilder.types';
import { ExportFormat } from '../../types/export.types';
import { getAvailableFormats } from '../../utils/exportFormats';
import { exportChain, validateChainForExport } from '../../utils/exportService';

interface ExportChainProps {
  dmnIds: string[];
  inputs: Record<string, unknown>;
  chainDmns: DmnModel[];
  chainName?: string;
  validation: ChainValidation | null;
}

const ExportChain: React.FC<ExportChainProps> = ({
  dmnIds,
  inputs,
  chainDmns,
  chainName = 'my-chain',
  validation,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('json');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [filename, setFilename] = useState('');

  const formats = getAvailableFormats();

  // Disable button if chain is empty OR invalid
  const isDisabled = dmnIds.length === 0 || !validation?.isValid;

  /**
   * Handle export button click
   */
  const handleExportClick = () => {
    // Validate chain first
    const validation = validateChainForExport(dmnIds);
    if (!validation.valid) {
      setExportError(validation.errors.join(', '));
      return;
    }

    setExportError(null);

    // Set default filename based on chain
    const defaultName = `chain-${dmnIds.length}-dmns`;
    setFilename(defaultName);

    setShowModal(true);
  };

  /**
   * Handle export execution
   */
  const handleExport = async () => {
    setIsExporting(true);
    setExportError(null);

    try {
      const result = await exportChain(dmnIds, inputs, chainDmns, {
        format: selectedFormat,
        filename: filename.trim() || chainName, // Use custom filename or fallback
        includeMetadata: true,
        prettyPrint: true,
      });

      if (result.success) {
        // Close modal on success
        setShowModal(false);
      } else {
        setExportError(result.error || 'Export failed');
      }
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * Get format icon
   */
  const getFormatIcon = (formatId: ExportFormat) => {
    switch (formatId) {
      case 'json':
        return <FileJson className="w-5 h-5" />;
      case 'bpmn':
        return <FileText className="w-5 h-5" />;
      default:
        return <Download className="w-5 h-5" />;
    }
  };

  return (
    <>
      {/* Export Button */}
      <button
        onClick={handleExportClick}
        disabled={isDisabled}
        className={`
          flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-sm
          transition-all duration-150
          ${
            isDisabled
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md'
          }
        `}
        title={
          dmnIds.length === 0
            ? 'Add DMNs to chain first'
            : !validation?.isValid
              ? 'Fix validation errors before exporting'
              : 'Export chain'
        }
      >
        <Download size={16} />
        Export Chain
      </button>

      {/* Export Error (shown outside modal) */}
      {exportError && !showModal && (
        <div className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
          {exportError}
        </div>
      )}

      {/* Export Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Export Chain</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {/* Chain Info */}
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <div className="text-sm text-gray-600">Chain Name</div>
                <div className="font-medium text-gray-900">{chainName}</div>
                <div className="text-xs text-gray-500">
                  {dmnIds.length} DMN{dmnIds.length !== 1 ? 's' : ''} • {Object.keys(inputs).length}{' '}
                  input{Object.keys(inputs).length !== 1 ? 's' : ''}
                </div>
              </div>

              {/* Filename Input */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Export Filename</label>
                <input
                  type="text"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && filename.trim() && !isExporting) {
                      handleExport();
                    }
                  }}
                  placeholder="Enter filename..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  autoFocus
                />
                <p className="text-xs text-gray-500">
                  Extension will be added automatically based on selected format
                </p>
              </div>

              {/* Format Selection */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Export Format</label>
                <div className="space-y-2">
                  {formats.map((format) => (
                    <button
                      key={format.id}
                      onClick={() => setSelectedFormat(format.id)}
                      className={`w-full flex items-start gap-3 p-3 rounded-lg border-2 transition-all ${
                        selectedFormat === format.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div
                        className={`flex-shrink-0 ${
                          selectedFormat === format.id ? 'text-blue-600' : 'text-gray-400'
                        }`}
                      >
                        {getFormatIcon(format.id)}
                      </div>
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{format.name}</span>
                          <span className="text-xs text-gray-500">.{format.extension}</span>
                        </div>
                        <div className="text-sm text-gray-600 mt-0.5">{format.description}</div>
                      </div>
                      {selectedFormat === format.id && (
                        <div className="flex-shrink-0">
                          <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                            <div className="w-2 h-2 bg-white rounded-full" />
                          </div>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Export Error */}
              {exportError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                  {exportError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowModal(false);
                  setFilename(''); // Reset filename on cancel
                }}
                disabled={isExporting}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={isExporting || !filename.trim()}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  isExporting || !filename.trim()
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
              >
                {isExporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Export
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ExportChain;
