import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileInput,
  Play,
  Zap,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { ChainExecutionResult, DmnModel } from '../../types';
import { ChainPreset, ChainValidation } from '../../types/chainBuilder.types';
import ChainResults from './ChainResults';
import ExecutionProgress from './ExecutionProgress';
import InputForm from './InputForm';

interface ChainConfigProps {
  chain: DmnModel[];
  validation: ChainValidation | null;
  inputs: Record<string, unknown>;
  onInputChange: (identifier: string, value: unknown) => void;
  onExecute: () => void;
  onLoadPreset: (preset: ChainPreset) => void;
  executionResult: ChainExecutionResult | null;
  isExecuting: boolean;
}

/**
 * Right panel: Chain configuration and execution
 */
const ChainConfig: React.FC<ChainConfigProps> = ({
  chain,
  validation,
  inputs,
  onInputChange,
  onExecute,
  onLoadPreset,
  executionResult,
  isExecuting,
}) => {
  const [showValidation, setShowValidation] = useState(true);
  const [showInputs, setShowInputs] = useState(true);

  // Add refs for scrollable container and execution area
  const scrollableContainerRef = useRef<HTMLDivElement>(null);
  const executionAreaRef = useRef<HTMLDivElement>(null);

  // Scroll to execution area when execution starts
  useEffect(() => {
    if (isExecuting && scrollableContainerRef.current && executionAreaRef.current) {
      // Calculate the position to scroll to
      const container = scrollableContainerRef.current;
      const executionArea = executionAreaRef.current;

      // Get the position of execution area relative to container
      const executionTop = executionArea.offsetTop;
      const containerHeight = container.clientHeight;
      const executionHeight = executionArea.clientHeight;

      // Scroll so execution area is visible at the top of the viewport
      container.scrollTo({
        top: executionTop - 20, // 20px padding from top
        behavior: 'smooth',
      });
    }
  }, [isExecuting]);

  // Preset chains
  const presets: ChainPreset[] = [
    {
      id: 'heusdenpas',
      name: 'Heusdenpas Chain',
      description: 'SVB → SZW → Heusden (Production chain)',
      dmnIds: [
        'SVB_LeeftijdsInformatie',
        'SZW_BijstandsnormInformatie',
        'RONL_HeusdenpasEindresultaat',
      ],
      defaultInputs: {
        // SVB inputs
        dagVanAanvraag: '2025-01-24',
        geboortedatumAanvrager: '1980-01-23',
        geboortedatumPartner: null, // ← Changed to null (single person)

        // SZW inputs
        aanvragerAlleenstaand: true, // ← Changed to true (single person)
        aanvragerHeeftKinderen: true,
        aanvragerHeeftAOWLeeftijd: false,

        // Heusden inputs
        aanvragerInwonerHeusden: true,
        aanvragerHeeftKind4Tm17: true,
        maandelijksBrutoInkomenAanvrager: 1500,
        aanvragerUitkeringBaanbrekers: false,
        aanvragerVoedselbankpasDenBosch: false,
        aanvragerKwijtscheldingGemeentelijkeBelastingen: false,
        aanvragerSchuldhulptrajectKredietbankNederland: false,
        aanvragerDitKalenderjaarAlAangevraagd: false,
        aanvragerAanmerkingStudieFinanciering: false,
        aanvragerIs181920: false,
        aanvragerIsTenminste21: true,
      },
    },
  ];

  if (chain.length === 0) {
    return (
      <div className="w-96 bg-white border-l border-slate-200 flex flex-col">
        <div className="p-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Chain Configuration</h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <div className="text-slate-400 mb-2">
              <FileInput size={48} className="mx-auto" />
            </div>
            <p className="text-sm text-slate-500">
              Add DMNs to your chain to configure and execute
            </p>
            {presets.length > 0 && (
              <div className="mt-6">
                <p className="text-xs text-slate-600 mb-2">Or load a preset:</p>
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => onLoadPreset(preset)}
                    className="w-full px-3 py-2 text-sm text-left text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200"
                  >
                    <div className="font-medium">{preset.name}</div>
                    <div className="text-xs text-slate-500">{preset.description}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-96 bg-white border-l border-slate-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-200">
        <h2 className="font-semibold text-slate-900">Chain Configuration</h2>
        <p className="text-xs text-slate-500 mt-1">
          {chain.length} DMN{chain.length !== 1 ? 's' : ''} in chain
        </p>
      </div>

      {/* Scrollable Content */}
      <div ref={scrollableContainerRef} className="flex-1 overflow-y-auto">
        {/* Validation Section */}
        {validation && (
          <div className="border-b border-slate-200">
            <button
              onClick={() => setShowValidation(!showValidation)}
              className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                {validation.isValid ? (
                  <CheckCircle2 size={18} className="text-green-600" />
                ) : (
                  <AlertCircle size={18} className="text-amber-600" />
                )}
                <span className="font-medium text-slate-900">Validation</span>
              </div>
              {showValidation ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showValidation && (
              <div className="px-4 pb-4 space-y-3">
                {/* Errors */}
                {validation.errors.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-red-600 mb-1">Errors:</div>
                    <div className="space-y-1">
                      {validation.errors.map((error, i) => (
                        <div key={i} className="text-xs text-red-600 bg-red-50 px-2 py-1.5 rounded">
                          • {error.message}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Warnings */}
                {validation.warnings.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-amber-600 mb-1">Warnings:</div>
                    <div className="space-y-1">
                      {validation.warnings.map((warning, i) => (
                        <div
                          key={i}
                          className="text-xs text-amber-600 bg-amber-50 px-2 py-1.5 rounded"
                        >
                          • {warning.message}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Missing Inputs */}
                {validation.missingInputs.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-slate-600 mb-1">
                      Required Inputs ({validation.missingInputs.length}):
                    </div>
                    <div className="space-y-1">
                      {validation.missingInputs.slice(0, 5).map((input) => (
                        <div
                          key={input.identifier}
                          className="text-xs text-slate-600 bg-slate-50 px-2 py-1.5 rounded"
                        >
                          • {input.identifier}
                          <span className="text-slate-400 ml-1">({input.type})</span>
                        </div>
                      ))}
                      {validation.missingInputs.length > 5 && (
                        <div className="text-xs text-slate-400 px-2">
                          +{validation.missingInputs.length - 5} more...
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Estimated Time */}
                {validation.isValid && (
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <Clock size={14} />
                    <span>Est. execution time: ~{validation.estimatedTime}ms</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {/* Inputs Section */}
        <div className="border-b border-slate-200">
          <button
            onClick={() => setShowInputs(!showInputs)}
            className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FileInput size={18} className="text-blue-600" />
              <span className="font-medium text-slate-900">Inputs</span>
            </div>
            {showInputs ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showInputs && (
            <div className="px-4 pb-4">
              <InputForm
                chain={chain}
                inputs={inputs}
                onInputChange={onInputChange}
                validation={validation}
                presetInputs={
                  presets.find(
                    (p) =>
                      JSON.stringify(p.dmnIds.sort()) ===
                      JSON.stringify(chain.map((d) => d.identifier).sort())
                  )?.defaultInputs
                } // ✅ ADD THIS LINE - Pass preset inputs if chain matches a preset
              />
            </div>
          )}
        </div>
        {/* Execution Area - Always rendered for scroll target */}
        <div ref={executionAreaRef}>
          {' '}
          {/* ✅ ADD THIS WRAPPER */}
          {/* Execution Progress */}
          {isExecuting && (
            <div className="p-4 border-b border-slate-200">
              <ExecutionProgress chain={chain} />
            </div>
          )}
          {/* Results */}
          {executionResult && (
            <div className="p-4">
              <ChainResults result={executionResult} />
            </div>
          )}
        </div>{' '}
        {/* ✅ CLOSE WRAPPER */}
      </div>

      {/* Execute Button (Footer) */}
      <div className="p-4 border-t border-slate-200 bg-slate-50">
        <button
          onClick={onExecute}
          disabled={!validation?.isValid || isExecuting}
          className={`
            w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium
            transition-all duration-150
            ${
              validation?.isValid && !isExecuting
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }
          `}
        >
          {isExecuting ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>Executing...</span>
            </>
          ) : (
            <>
              <Zap size={18} />
              <span>Execute Chain</span>
            </>
          )}
        </button>

        {!validation?.isValid && chain.length > 0 && (
          <p className="text-xs text-center text-amber-600 mt-2">
            Fix validation errors to execute
          </p>
        )}
      </div>
    </div>
  );
};

export default ChainConfig;
