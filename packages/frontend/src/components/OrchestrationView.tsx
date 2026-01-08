import { ArrowRight, GitBranch, Info, Loader2, Play, Search } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { DmnChainLink, DmnModel, SparqlBinding, SparqlResponse } from '../types';

interface OrchestrationViewProps {
  sparqlResult: SparqlResponse | null;
  isLoading: boolean;
  onRunQuery: (query: string) => void;
}

const OrchestrationView: React.FC<OrchestrationViewProps> = ({
  sparqlResult,
  isLoading,
  onRunQuery,
}) => {
  const [dmns, setDmns] = useState<DmnModel[]>([]);
  const [chains, setChains] = useState<DmnChainLink[]>([]);
  const [selectedDmn, setSelectedDmn] = useState<DmnModel | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Parse SPARQL results into DMN models
  useEffect(() => {
    if (!sparqlResult?.results.bindings) return;

    const bindings = sparqlResult.results.bindings;
    const vars = sparqlResult.head.vars;

    // Detect query type and parse accordingly
    if (vars.includes('dmn') && vars.includes('identifier') && vars.includes('title')) {
      // Check if it has input/output columns (enhanced query)
      if (vars.includes('inputUri') || vars.includes('outputUri')) {
        parseDmnListWithIO(bindings);
      } else {
        parseDmnList(bindings);
      }
    } else if (vars.includes('dmn1') && vars.includes('dmn2')) {
      parseDmnChains(bindings);
    } else if (vars.includes('inputId') || vars.includes('outputId')) {
      parseDmnDetails(bindings);
    }
  }, [sparqlResult]);

  const parseDmnList = (bindings: Record<string, SparqlBinding>[]): void => {
    const dmnMap = new Map<string, DmnModel>();

    bindings.forEach((binding) => {
      const uri = binding.dmn?.value;
      if (!uri) return;

      if (!dmnMap.has(uri)) {
        dmnMap.set(uri, {
          uri,
          identifier: binding.identifier?.value || '',
          title: binding.title?.value || '',
          apiEndpoint: binding.apiEndpoint?.value || '',
          deploymentId: binding.deploymentId?.value,
          service: binding.service?.value,
          inputs: [],
          outputs: [],
        });
      }
    });

    setDmns(Array.from(dmnMap.values()));
  };

  const parseDmnListWithIO = (bindings: Record<string, SparqlBinding>[]): void => {
    const dmnMap = new Map<string, DmnModel>();

    bindings.forEach((binding) => {
      const uri = binding.dmn?.value;
      if (!uri) return;

      // Get or create DMN
      if (!dmnMap.has(uri)) {
        dmnMap.set(uri, {
          uri,
          identifier: binding.identifier?.value || '',
          title: binding.title?.value || '',
          apiEndpoint: binding.apiEndpoint?.value || '',
          deploymentId: binding.deploymentId?.value,
          service: binding.service?.value,
          inputs: [],
          outputs: [],
        });
      }

      const dmn = dmnMap.get(uri)!;

      // Add input if present and not duplicate
      if (binding.inputUri?.value && binding.inputId?.value) {
        const inputExists = dmn.inputs.some((i) => i.uri === binding.inputUri?.value);
        if (!inputExists) {
          dmn.inputs.push({
            uri: binding.inputUri.value,
            identifier: binding.inputId.value,
            type: binding.inputType?.value || 'String',
            label: binding.inputTitle?.value || binding.inputId.value,
          });
        }
      }

      // Add output if present and not duplicate
      if (binding.outputUri?.value && binding.outputId?.value) {
        const outputExists = dmn.outputs.some((o) => o.uri === binding.outputUri?.value);
        if (!outputExists) {
          dmn.outputs.push({
            uri: binding.outputUri.value,
            identifier: binding.outputId.value,
            type: binding.outputType?.value || 'String',
            label: binding.outputTitle?.value || binding.outputId.value,
          });
        }
      }
    });

    setDmns(Array.from(dmnMap.values()));
  };

  const parseDmnChains = (bindings: Record<string, SparqlBinding>[]): void => {
    const chainLinks: DmnChainLink[] = bindings.map((binding) => ({
      sourceDmn: binding.dmn1?.value || '',
      targetDmn: binding.dmn2?.value || '',
      sourceOutput: binding.dmn1Title?.value || '',
      targetInput: binding.dmn2Title?.value || '',
      variableId: binding.variableId?.value || '',
      variableType: binding.variableType?.value || '',
    }));

    setChains(chainLinks);
  };

  const parseDmnDetails = (bindings: Record<string, SparqlBinding>[]): void => {
    const dmnMap = new Map<string, DmnModel>();

    bindings.forEach((binding) => {
      const uri = binding.dmn?.value;
      if (!uri) return;

      if (!dmnMap.has(uri)) {
        dmnMap.set(uri, {
          uri,
          identifier: '',
          title: binding.dmnTitle?.value || '',
          apiEndpoint: '',
          inputs: [],
          outputs: [],
        });
      }

      const dmn = dmnMap.get(uri)!;

      if (binding.inputUri?.value && binding.inputId?.value) {
        const inputExists = dmn.inputs.some((i) => i.uri === binding.inputUri?.value);
        if (!inputExists) {
          dmn.inputs.push({
            uri: binding.inputUri.value,
            identifier: binding.inputId.value,
            type: binding.inputType?.value || 'String',
            label: binding.inputId.value,
          });
        }
      }

      if (binding.outputUri?.value && binding.outputId?.value) {
        const outputExists = dmn.outputs.some((o) => o.uri === binding.outputUri?.value);
        if (!outputExists) {
          dmn.outputs.push({
            uri: binding.outputUri.value,
            identifier: binding.outputId.value,
            type: binding.outputType?.value || 'String',
            label: binding.outputId.value,
          });
        }
      }
    });

    setDmns(Array.from(dmnMap.values()));
  };

  const filteredDmns = dmns.filter(
    (dmn) =>
      dmn.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      dmn.identifier.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getChainCount = (dmnUri: string): number => {
    return chains.filter((c) => c.sourceDmn === dmnUri || c.targetDmn === dmnUri).length;
  };

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Left Panel - DMN List */}
      <div className="flex-1 border-r border-slate-200 bg-white flex flex-col">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <GitBranch size={18} className="text-blue-600" />
              Decision Models
            </h3>
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full border border-blue-200">
              {dmns.length} DMNs
            </span>
          </div>

          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Search DMNs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            <div className="text-center">
              <Loader2 className="animate-spin mx-auto mb-2" size={32} />
              <p className="text-sm">Discovering DMNs...</p>
            </div>
          </div>
        ) : dmns.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center text-slate-400">
              <GitBranch size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium mb-2">No DMNs Found</p>
              <p className="text-xs mb-4">Run a DMN discovery query from the Discover button</p>
              <button
                onClick={() => onRunQuery('Find All DMNs')}
                className="px-4 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 mx-auto"
              >
                <Play size={14} />
                Discover DMNs
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="p-3 space-y-2">
              {filteredDmns.map((dmn) => (
                <button
                  key={dmn.uri}
                  onClick={() => setSelectedDmn(dmn)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedDmn?.uri === dmn.uri
                      ? 'bg-blue-50 border-blue-300 shadow-sm'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="text-sm font-semibold text-slate-800 leading-tight pr-2">
                      {dmn.title || dmn.identifier}
                    </h4>
                    {getChainCount(dmn.uri) > 0 && (
                      <span className="flex-shrink-0 px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded">
                        {getChainCount(dmn.uri)} links
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-500 space-y-1">
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-[10px] px-1.5 py-0.5 bg-slate-100 rounded">
                        {dmn.identifier}
                      </span>
                    </div>

                    {(dmn.inputs.length > 0 || dmn.outputs.length > 0) && (
                      <div className="flex gap-2 mt-2">
                        {dmn.inputs.length > 0 && (
                          <span className="text-[10px] text-blue-600">
                            ↓ {dmn.inputs.length} inputs
                          </span>
                        )}
                        {dmn.outputs.length > 0 && (
                          <span className="text-[10px] text-green-600">
                            ↑ {dmn.outputs.length} outputs
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Middle Panel - Chain Visualization (Placeholder) */}
      <div className="flex-1 bg-slate-50 flex flex-col">
        <div className="p-4 border-b border-slate-200 bg-white">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <GitBranch size={18} className="text-purple-600" />
            Process Chain Builder
            <span className="ml-auto px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full border border-purple-200">
              Phase B.3
            </span>
          </h3>
        </div>

        <div className="flex-1 flex items-center justify-center p-8">
          {chains.length > 0 ? (
            <div className="max-w-2xl text-center">
              <div className="mb-6 p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                <h4 className="text-lg font-bold text-slate-800 mb-2">
                  {chains.length} DMN Chain{chains.length !== 1 ? 's' : ''} Discovered
                </h4>
                <p className="text-sm text-slate-600 mb-4">
                  Found {chains.length} potential connection{chains.length !== 1 ? 's' : ''} between
                  DMNs based on matching input/output variables.
                </p>

                {/* Chain Preview List */}
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {chains.slice(0, 10).map((chain, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 bg-slate-50 rounded border border-slate-200 text-xs"
                    >
                      <span className="font-mono text-blue-600 truncate flex-1">
                        {chain.sourceOutput.split('/').pop()}
                      </span>
                      <ArrowRight size={14} className="mx-2 text-slate-400 flex-shrink-0" />
                      <span className="font-mono text-green-600 truncate flex-1 text-right">
                        {chain.targetInput.split('/').pop()}
                      </span>
                      <span className="ml-2 px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-[10px] font-medium">
                        {chain.variableId}
                      </span>
                    </div>
                  ))}
                  {chains.length > 10 && (
                    <p className="text-xs text-slate-400 pt-2">
                      ... and {chains.length - 10} more connections
                    </p>
                  )}
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <Info size={20} className="mx-auto mb-2 text-blue-600" />
                <p className="text-sm text-slate-700 mb-2">
                  <strong>Coming in Phase B.3:</strong> Visual chain builder
                </p>
                <p className="text-xs text-slate-600">
                  Drag-and-drop interface to compose DMN chains into executable processes.
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center text-slate-400 max-w-md">
              <GitBranch size={64} className="mx-auto mb-4 opacity-20" />
              <h4 className="text-lg font-semibold mb-2">Visual Process Chain Builder</h4>
              <p className="text-sm mb-4">
                This is where you&apos;ll compose DMN chains into executable processes.
              </p>
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 text-left">
                <p className="text-xs text-slate-700 mb-2">
                  <strong>Phase B.3 Features:</strong>
                </p>
                <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                  <li>Drag-and-drop DMN composition</li>
                  <li>Visual data flow connections</li>
                  <li>Chain validation and conflict detection</li>
                  <li>Process chain preview</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - DMN Details */}
      <div className="flex-1 border-l border-slate-200 bg-white flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Info size={18} className="text-indigo-600" />
            DMN Details
          </h3>
        </div>

        {selectedDmn ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
            {/* DMN Header */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-200">
              <h4 className="text-lg font-bold text-slate-800 mb-1">{selectedDmn.title}</h4>
              <p className="text-xs font-mono text-slate-500 mb-3">{selectedDmn.identifier}</p>

              {selectedDmn.apiEndpoint && (
                <div className="mt-3 p-2 bg-white rounded border border-slate-200">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">
                    API Endpoint
                  </p>
                  <p className="text-xs font-mono text-blue-600 break-all">
                    {selectedDmn.apiEndpoint}
                  </p>
                </div>
              )}
            </div>

            {/* Inputs */}
            {selectedDmn.inputs.length > 0 && (
              <div>
                <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  Input Variables ({selectedDmn.inputs.length})
                </h5>
                <div className="space-y-2">
                  {selectedDmn.inputs.map((input) => (
                    <div
                      key={input.uri}
                      className="p-3 bg-blue-50 rounded-lg border border-blue-200"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-slate-800">
                          {input.identifier}
                        </span>
                        <span className="px-2 py-0.5 bg-blue-200 text-blue-800 text-[10px] font-mono rounded">
                          {input.type}
                        </span>
                      </div>
                      {input.label && input.label !== input.identifier && (
                        <p className="text-xs text-slate-600">{input.label}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Outputs */}
            {selectedDmn.outputs.length > 0 && (
              <div>
                <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Output Variables ({selectedDmn.outputs.length})
                </h5>
                <div className="space-y-2">
                  {selectedDmn.outputs.map((output) => (
                    <div
                      key={output.uri}
                      className="p-3 bg-green-50 rounded-lg border border-green-200"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-slate-800">
                          {output.identifier}
                        </span>
                        <span className="px-2 py-0.5 bg-green-200 text-green-800 text-[10px] font-mono rounded">
                          {output.type}
                        </span>
                      </div>
                      {output.label && output.label !== output.identifier && (
                        <p className="text-xs text-slate-600">{output.label}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Chain Connections */}
            {chains.length > 0 && (
              <div>
                <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                  Chain Connections
                </h5>
                <div className="space-y-2">
                  {chains
                    .filter(
                      (c) => c.sourceDmn === selectedDmn.uri || c.targetDmn === selectedDmn.uri
                    )
                    .map((chain, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-purple-50 rounded-lg border border-purple-200"
                      >
                        <div className="flex items-center gap-2 text-xs">
                          {chain.sourceDmn === selectedDmn.uri ? (
                            <>
                              <span className="text-green-600 font-semibold">Produces</span>
                              <ArrowRight size={14} className="text-slate-400" />
                              <span className="text-slate-600 font-mono">{chain.variableId}</span>
                              <ArrowRight size={14} className="text-slate-400" />
                              <span className="text-blue-600 font-semibold truncate">
                                {chain.targetInput.split('/').pop()}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="text-blue-600 font-semibold truncate">
                                {chain.sourceOutput.split('/').pop()}
                              </span>
                              <ArrowRight size={14} className="text-slate-400" />
                              <span className="text-slate-600 font-mono">{chain.variableId}</span>
                              <ArrowRight size={14} className="text-slate-400" />
                              <span className="text-green-600 font-semibold">Consumes</span>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Metadata */}
            {selectedDmn.deploymentId && (
              <div className="pt-4 border-t border-slate-200">
                <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Metadata
                </h5>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Deployment ID:</span>
                    <span className="font-mono text-slate-700">{selectedDmn.deploymentId}</span>
                  </div>
                  {selectedDmn.service && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Service:</span>
                      <span className="font-mono text-slate-700 truncate ml-2">
                        {selectedDmn.service.split('/').pop()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-6 text-slate-400">
            <div className="text-center">
              <Info size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a DMN to view details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrchestrationView;
