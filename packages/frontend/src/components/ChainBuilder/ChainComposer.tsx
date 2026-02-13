/* eslint-disable @typescript-eslint/no-explicit-any */
import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertCircle, CheckCircle2, ExternalLink, GripVertical, Trash2, X } from 'lucide-react';
import React from 'react';

import { DmnModel } from '../../types';
import { ChainValidation } from '../../types/chainBuilder.types';

interface ChainComposerProps {
  chain: DmnModel[];
  onRemoveDmn: (identifier: string) => void;
  onClearChain: () => void;
  validation: ChainValidation | null;
}

interface SortableChainItemProps {
  dmn: DmnModel;
  index: number;
  onRemove: (identifier: string) => void;
}

const SortableChainItem: React.FC<SortableChainItemProps> = ({ dmn, index, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dmn.identifier,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="mb-3">
      <div
        className={`
      relative
      bg-white rounded-lg border-2 shadow-sm
      ${isDragging ? 'border-blue-500 shadow-lg' : dmn.isDrd ? 'border-purple-500' : 'border-slate-200'}
      ${dmn.isDrd ? 'bg-purple-50' : ''}
      transition-all duration-150
    `}
      >
        {/* DRD Badge - positioned absolutely relative to this card */}
        {dmn.isDrd && (
          <div className="absolute top-3 right-3 z-10">
            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-purple-600 text-white rounded shadow-sm">
              🔗 DRD
            </span>
          </div>
        )}

        <div className="p-4">
          <div className="flex items-start gap-3">
            {/* Drag Handle */}
            <div
              {...attributes}
              {...listeners}
              className="flex-shrink-0 mt-1 cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600"
            >
              <GripVertical size={20} />
            </div>

            {/* Step Number */}
            <div
              className={`
              flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm
              ${dmn.isDrd ? 'bg-purple-600 text-white' : 'bg-blue-500 text-white'}
            `}
            >
              {index + 1}
            </div>

            {/* DMN Info */}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-slate-900">
                {dmn.isDrd ? dmn.title : dmn.identifier}
              </h3>
              {dmn.description && <p className="text-xs text-slate-500 mt-1">{dmn.description}</p>}

              {/* Deployment ID */}
              {dmn.deploymentId && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-slate-500">Deployment:</span>
                  <code
                    className={`text-xs px-2 py-0.5 rounded font-mono ${
                      dmn.isDrd ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {dmn.deploymentId.substring(0, 8)}...
                  </code>
                  {dmn.isDrd && (
                    <a
                      href={`https://operaton.open-regels.nl/operaton/app/cockpit/default/#/decision-definition/${dmn.identifier}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-600 hover:text-purple-700"
                      title="View in Operaton Cockpit"
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              )}

              {/* Logo and Organization */}
              {(dmn.logoUrl || dmn.organizationName) && (
                <div className="flex items-center gap-2 mt-2 mb-2">
                  {dmn.logoUrl && (
                    <img
                      src={dmn.logoUrl}
                      alt={dmn.organizationName || 'Organization'}
                      className="w-6 h-6 object-contain rounded border border-slate-200 bg-white p-0.5"
                      title={dmn.organizationName}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                  {dmn.organizationName && (
                    <span className="text-xs text-slate-600 font-medium">
                      {dmn.organizationName}
                    </span>
                  )}
                </div>
              )}

              {/* METADATA SECTION */}
              <div className="mt-2 space-y-1">
                {dmn.identifier && (
                  <div className="flex items-start gap-2 text-xs">
                    <span className="font-medium text-slate-600 flex-shrink-0">
                      Definition Key:
                    </span>
                    <span className="text-slate-500 font-mono text-[10px] break-all">
                      {dmn.identifier}
                    </span>
                  </div>
                )}
                {dmn.deploymentId && (
                  <div className="flex items-start gap-2 text-xs">
                    <span className="font-medium text-slate-600 flex-shrink-0">Deployment ID:</span>
                    <span className="text-slate-500 font-mono text-[10px] break-all">
                      {dmn.deploymentId}
                    </span>
                  </div>
                )}
                {dmn.implementedBy && (
                  <div className="flex items-start gap-2 text-xs">
                    <span className="font-medium text-slate-600 flex-shrink-0">API Endpoint:</span>

                    <a
                      href={dmn.implementedBy}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 font-mono text-[10px] break-all underline decoration-dotted underline-offset-2 inline-flex items-center gap-1 group"
                      title="Open API endpoint in new tab"
                    >
                      <span>{dmn.implementedBy}</span>
                      <ExternalLink
                        size={10}
                        className="flex-shrink-0 opacity-60 group-hover:opacity-100"
                      />
                    </a>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                <span>
                  {dmn.inputs.length} input{dmn.inputs.length !== 1 ? 's' : ''}
                </span>
                <span>→</span>
                <span>
                  {dmn.outputs.length} output{dmn.outputs.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Remove Button */}
            <button
              onClick={() => onRemove(dmn.identifier)}
              className="flex-shrink-0 p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
              title="Remove from chain"
            >
              <X size={16} />
            </button>
          </div>

          {/* Show inputs/outputs */}
          <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs">
            {/* Inputs */}
            <div>
              <div className="font-medium text-slate-700 mb-1">Inputs:</div>
              <div className="space-y-0.5">
                {dmn.inputs.slice(0, 3).map((input, inputIdx) => (
                  <div
                    key={`${dmn.identifier}-input-${input.identifier}-${inputIdx}`}
                    className="text-slate-500"
                  >
                    • {input.identifier}
                    <span className="text-slate-400 ml-1">({input.type})</span>
                  </div>
                ))}
                {dmn.inputs.length > 3 && (
                  <div className="text-slate-400">+{dmn.inputs.length - 3} more...</div>
                )}
              </div>
            </div>

            {/* Outputs */}
            <div>
              <div className="font-medium text-slate-700 mb-1">Outputs:</div>
              <div className="space-y-0.5">
                {dmn.outputs.slice(0, 3).map((output, outputIdx) => (
                  <div
                    key={`${dmn.identifier}-output-${output.identifier}-${outputIdx}`}
                    className="text-slate-500"
                  >
                    • {output.identifier}
                    <span className="text-slate-400 ml-1">({output.type})</span>
                  </div>
                ))}
                {dmn.outputs.length > 3 && (
                  <div className="text-slate-400">+{dmn.outputs.length - 3} more...</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Connection Indicator (except for last item) */}
        {index < (dmn as any)._totalCount - 1 && (
          <div className="flex justify-center pb-3">
            <div className="w-0.5 h-8 bg-slate-200"></div>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Middle panel: Chain composer with drop zone
 */
const ChainComposer: React.FC<ChainComposerProps> = ({
  chain,
  onRemoveDmn,
  onClearChain,
  validation,
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: 'chain-droppable',
  });

  return (
    <div className="flex-1 bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="p-4 bg-white border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Chain Composer</h2>
            <p className="text-xs text-slate-500 mt-1">
              Drop DMNs here to build your execution chain
            </p>
          </div>
          {chain.length > 0 && (
            <button
              onClick={onClearChain}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 size={14} />
              Clear Chain
            </button>
          )}
        </div>

        {/* Validation Summary */}
        {validation && chain.length > 0 && (
          <div className="mt-3 space-y-2">
            {/* Execution Validation */}
            {validation.isValid ? (
              <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">
                <CheckCircle2 size={16} />
                <span>Chain is valid and ready to execute</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                <AlertCircle size={16} />
                <span>
                  {validation.missingInputs.length} input
                  {validation.missingInputs.length !== 1 ? 's' : ''} required
                </span>
              </div>
            )}

            {/* DRD Compatibility */}
            {validation.isValid && !validation.isDrdCompatible && (
              <div className="text-sm text-purple-700 bg-purple-50 px-3 py-2 rounded-lg">
                <div className="flex items-center gap-2 font-medium mb-1">
                  <AlertCircle size={16} />
                  <span>Cannot save as DRD</span>
                </div>
                <div className="text-xs text-purple-600">
                  This chain uses semantic variable matching. Use sequential execution only.
                </div>
              </div>
            )}

            {/* Semantic Matches Details */}
            {validation.semanticMatches.length > 0 && (
              <details className="text-xs bg-slate-50 rounded-lg">
                <summary className="cursor-pointer px-3 py-2 text-slate-700 hover:bg-slate-100 rounded-lg">
                  🔗 {validation.semanticMatches.length} semantic link
                  {validation.semanticMatches.length !== 1 ? 's' : ''} detected
                </summary>
                <div className="px-3 pb-3 pt-1 space-y-2">
                  {validation.semanticMatches.map((match, idx) => (
                    <div key={idx} className="bg-white p-2 rounded border border-slate-200">
                      <div className="font-mono text-[10px] text-slate-600">{match.outputDmn}</div>
                      <div className="text-blue-600 font-medium">
                        {match.outputVar} → {match.inputVar}
                      </div>
                      <div className="font-mono text-[10px] text-slate-600">{match.inputDmn}</div>
                      <div className="text-emerald-600 font-mono text-[10px] mt-1">
                        via {match.semanticConcept?.split('/').pop()}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      {/* Drop Zone / Chain Display */}
      <div
        ref={setNodeRef}
        className={`
          flex-1 p-4 overflow-y-auto
          ${isOver ? 'bg-blue-50' : 'bg-slate-50'}
          transition-colors duration-150
        `}
      >
        {chain.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-32 h-32 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
                <GripVertical size={48} className="text-slate-300" />
              </div>
              <h3 className="text-lg font-medium text-slate-600 mb-2">No DMNs in chain yet</h3>
              <p className="text-sm text-slate-400">
                Drag DMNs from the left panel to start building
              </p>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto">
            {chain.map((dmn, index) => {
              // Hacky way to pass total count for connection indicator
              (dmn as any)._totalCount = chain.length;
              return (
                <SortableChainItem
                  key={dmn.identifier}
                  dmn={dmn}
                  index={index}
                  onRemove={onRemoveDmn}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChainComposer;
