import {
  AlertCircle,
  BookOpen,
  Code2,
  Database,
  Download,
  GitBranch,
  HelpCircle,
  Loader2,
  Play,
  Plus,
  Settings,
  Share2,
  Trash2,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';

import ChainBuilder from './components/ChainBuilder/ChainBuilder';
import Changelog from './components/Changelog';
import GraphView from './components/GraphView';
import ResultsTable from './components/ResultsTable';
import Tutorial from './components/Tutorial/Tutorial';
import { executeSparqlQuery } from './services/sparqlService';
import { SparqlResponse, ViewMode } from './types';
import { ALL_QUERIES, PRESET_ENDPOINTS, SAMPLE_QUERIES } from './utils/constants';

const VIEWMODE_STORAGE_KEY = 'linkedDataExplorer_activeView';

const App: React.FC = () => {
  // Load saved viewMode from localStorage, default to QUERY
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(VIEWMODE_STORAGE_KEY);
    if (saved && Object.values(ViewMode).includes(saved as ViewMode)) {
      return saved as ViewMode;
    }
    return ViewMode.QUERY;
  });

  const [savedEndpoints, setSavedEndpoints] = useState(PRESET_ENDPOINTS);
  const [endpoint, setEndpoint] = useState(PRESET_ENDPOINTS[1]?.url || PRESET_ENDPOINTS[0].url);
  const [query, setQuery] = useState(SAMPLE_QUERIES[0].sparql);
  const [sparqlResult, setSparqlResult] = useState<SparqlResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [newEndpointName, setNewEndpointName] = useState('');
  const [newEndpointUrl, setNewEndpointUrl] = useState('');

  // Save viewMode to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(VIEWMODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  const handleRunQuery = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await executeSparqlQuery(endpoint, query);
      setSparqlResult(data);

      if (query.toLowerCase().includes('?s ?p ?o')) {
        setViewMode(ViewMode.VISUALIZE);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSampleClick = (sampleQuery: string) => {
    // Find the actual query object
    const queryObj = ALL_QUERIES.find((q) => q.name === sampleQuery || q.sparql === sampleQuery);

    if (queryObj) {
      setQuery(queryObj.sparql);
      // ✅ Don't auto-switch views - let user stay where they are
    }
  };

  const handleAddEndpoint = () => {
    if (newEndpointName && newEndpointUrl) {
      setSavedEndpoints([...savedEndpoints, { name: newEndpointName, url: newEndpointUrl }]);
      setNewEndpointName('');
      setNewEndpointUrl('');
    }
  };

  const handleDeleteEndpoint = (index: number) => {
    const newEndpoints = [...savedEndpoints];
    newEndpoints.splice(index, 1);
    setSavedEndpoints(newEndpoints);
  };

  const handleResetDefaults = () => {
    if (confirm('Reset endpoints to default system presets?')) {
      setSavedEndpoints(PRESET_ENDPOINTS);
      setEndpoint(PRESET_ENDPOINTS[1]?.url || PRESET_ENDPOINTS[0].url);
    }
  };

  const getLibraryQueries = () => {
    // For now, always show SAMPLE_QUERIES
    // DMN queries are accessed via "Discover DMNs" button
    return ALL_QUERIES;
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden text-slate-900">
      {/* Sidebar Navigation */}
      <nav className="w-16 md:w-20 bg-slate-900 flex flex-col items-center py-6 gap-6 z-20 flex-shrink-0">
        <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-blue-900/50">
          <Database size={20} />
        </div>

        <div className="flex-1 w-full flex flex-col items-center gap-4 mt-4">
          <button
            onClick={() => setViewMode(ViewMode.QUERY)}
            className={`p-3 rounded-xl transition-all ${viewMode === ViewMode.QUERY ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            title="SPARQL Editor"
          >
            <Code2 size={24} />
          </button>

          <button
            onClick={() => setViewMode(ViewMode.ORCHESTRATION)}
            className={`p-3 rounded-xl transition-all ${viewMode === ViewMode.ORCHESTRATION ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            title="DMN Orchestration"
          >
            <GitBranch size={24} />
          </button>

          <button
            onClick={() => setViewMode(ViewMode.VISUALIZE)}
            className={`p-3 rounded-xl transition-all ${viewMode === ViewMode.VISUALIZE ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            title="Graph Visualization"
          >
            <Share2 size={24} />
          </button>

          <button
            onClick={() => setViewMode(ViewMode.TUTORIAL)}
            className={`p-3 rounded-xl transition-all ${viewMode === ViewMode.TUTORIAL ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            title="Getting Started"
          >
            <HelpCircle size={24} />
          </button>

          <button
            onClick={() => setViewMode(ViewMode.CHANGELOG)}
            className={`p-3 rounded-xl transition-all ${viewMode === ViewMode.CHANGELOG ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            title="Changelog"
          >
            <BookOpen size={24} />
          </button>
        </div>

        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`p-3 rounded-xl transition-all ${showSettings ? 'text-blue-400' : 'text-slate-400 hover:text-white'}`}
          title="Settings"
        >
          <Settings size={24} />
        </button>
      </nav>

      {/* Main UI Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header with App Info & Endpoint Selection */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">
              Linked Data Explorer
            </h1>
            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium border border-blue-200">
              Regels Overheid
            </span>
          </div>

          {viewMode !== ViewMode.CHANGELOG && viewMode !== ViewMode.TUTORIAL && (
            <div className="flex items-center gap-3">
              <div className="hidden lg:flex items-center bg-slate-100 rounded-md px-3 py-1.5 border border-slate-200 relative group">
                <span className="text-xs text-slate-500 mr-2 font-semibold uppercase tracking-tight">
                  Endpoint
                </span>
                <input
                  type="text"
                  list="endpoint-options"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder="Select or type endpoint URL"
                  className="bg-transparent text-sm text-slate-700 focus:outline-none w-80 font-mono truncate"
                />
                <datalist id="endpoint-options">
                  {savedEndpoints.map((ep, idx) => (
                    <option key={idx} value={ep.url}>
                      {ep.name}
                    </option>
                  ))}
                </datalist>
              </div>
              <button
                onClick={handleRunQuery}
                disabled={isLoading}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm text-white shadow-sm transition-all
                  ${isLoading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:shadow-md active:transform active:scale-95'}
                `}
              >
                {isLoading ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Play size={16} fill="currentColor" />
                )}
                Run Query
              </button>
            </div>
          )}
        </header>

        {/* Workspace Panels */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Tutorial View (Full Width) */}
          {viewMode === ViewMode.TUTORIAL && (
            <div className="flex-1 overflow-hidden">
              <Tutorial />
            </div>
          )}

          {/* Changelog View (Full Width) */}
          {viewMode === ViewMode.CHANGELOG && (
            <div className="flex-1 overflow-hidden">
              <Changelog />
            </div>
          )}

          {/* Orchestration View - Chain Builder */}
          {viewMode === ViewMode.ORCHESTRATION && (
            <div className="flex-1 overflow-hidden">
              <ChainBuilder />
            </div>
          )}

          {/* Settings Panel Overlay */}
          {showSettings && viewMode !== ViewMode.CHANGELOG && viewMode !== ViewMode.TUTORIAL && (
            <div className="absolute top-0 left-0 z-30 w-[450px] h-full bg-white border-r border-slate-200 shadow-2xl p-5 animate-in slide-in-from-left fade-in duration-200 flex flex-col">
              <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-2">
                <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                  <Settings size={18} /> Configuration
                </h3>
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
                  aria-label="Close settings"
                >
                  &times;
                </button>
              </div>

              <div className="space-y-4 overflow-y-auto pr-1">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wider">
                    Active Endpoint URL
                  </label>
                  <input
                    type="text"
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono text-slate-600"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Changes are reset on browser refresh.
                  </p>
                </div>

                <hr className="border-slate-100" />

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Session Endpoints
                    </label>
                    <button
                      onClick={handleResetDefaults}
                      className="text-[10px] text-blue-500 hover:underline"
                    >
                      Reset Defaults
                    </button>
                  </div>

                  <div className="space-y-2 mb-3 max-h-[300px] overflow-y-auto pr-1">
                    {savedEndpoints.map((ep, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between group p-2 rounded hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all"
                      >
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => {
                            setEndpoint(ep.url);
                          }}
                        >
                          <div className="text-sm font-medium text-slate-700 truncate">
                            {ep.name}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate font-mono">
                            {ep.url}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {endpoint === ep.url && (
                            <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                              Active
                            </span>
                          )}
                          <button
                            onClick={() => handleDeleteEndpoint(idx)}
                            className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove Endpoint"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add New Endpoint Form */}
                  <div className="bg-slate-50 p-3 rounded border border-slate-200 shadow-inner">
                    <div className="text-xs font-medium text-slate-500 mb-2">
                      Add New TripleDB/Jena Endpoint
                    </div>
                    <input
                      type="text"
                      placeholder="Display Name (e.g. Local TripleDB)"
                      value={newEndpointName}
                      onChange={(e) => setNewEndpointName(e.target.value)}
                      className="w-full mb-2 border border-slate-300 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="SPARQL Endpoint URL"
                        value={newEndpointUrl}
                        onChange={(e) => setNewEndpointUrl(e.target.value)}
                        className="flex-1 border border-slate-300 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none font-mono"
                      />
                      <button
                        onClick={handleAddEndpoint}
                        disabled={!newEndpointName || !newEndpointUrl}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-medium disabled:opacity-50 transition-colors shadow-sm"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Left Editor Pane */}
          {viewMode !== ViewMode.VISUALIZE &&
            viewMode !== ViewMode.CHANGELOG &&
            viewMode !== ViewMode.ORCHESTRATION &&
            viewMode !== ViewMode.TUTORIAL && (
              <div className="w-1/2 md:w-[450px] lg:w-[500px] border-r border-slate-200 bg-white flex flex-col h-full shadow-sm z-10">
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      SPARQL Query Editor
                    </span>
                    <div className="flex gap-2">
                      <button
                        className="p-1 text-slate-400 hover:text-blue-600 transition-colors"
                        title="Copy to Clipboard"
                        onClick={() => navigator.clipboard.writeText(query)}
                      >
                        <Code2 size={16} />
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="flex-1 w-full p-4 font-mono text-sm text-slate-800 bg-white focus:outline-none resize-none leading-relaxed overflow-auto code-scroll"
                    spellCheck={false}
                    aria-label="SPARQL Query"
                  />
                </div>

                <div className="h-1/3 border-t border-slate-200 flex flex-col bg-slate-50 overflow-hidden">
                  <div className="px-4 py-2 border-b border-slate-200 flex justify-between items-center flex-shrink-0">
                    <span className="text-xs font-bold text-slate-500 uppercase">Library</span>
                  </div>
                  <div className="overflow-y-auto flex-1 p-2 space-y-1 custom-scrollbar">
                    {getLibraryQueries().map((q, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSampleClick(q.name)}
                        className="w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-white hover:text-blue-600 rounded-md border border-transparent hover:border-slate-200 transition-all truncate shadow-sm hover:shadow"
                      >
                        {q.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

          {/* Right Results Pane */}
          {viewMode !== ViewMode.CHANGELOG &&
            viewMode !== ViewMode.ORCHESTRATION &&
            viewMode !== ViewMode.TUTORIAL && (
              <div className="flex-1 bg-slate-50 relative flex flex-col min-w-0 overflow-hidden">
                {/* Error Overlay */}
                {error && (
                  <div className="absolute top-4 left-4 right-4 z-50 bg-red-50 text-red-700 px-4 py-3 rounded-lg border border-red-200 shadow-lg flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    <AlertCircle className="flex-shrink-0 mt-0.5" size={18} />
                    <div className="text-sm whitespace-pre-wrap font-medium flex-1">{error}</div>
                    <button
                      onClick={() => setError(null)}
                      className="ml-auto text-red-400 hover:text-red-700 text-xl font-bold leading-none"
                      aria-label="Dismiss error"
                    >
                      &times;
                    </button>
                  </div>
                )}

                {viewMode === ViewMode.VISUALIZE ? (
                  <div className="flex-1 p-4 h-full overflow-hidden">
                    <GraphView data={sparqlResult} />
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col h-full overflow-hidden">
                    <div className="px-6 py-3 border-b border-slate-200 bg-white flex justify-between items-center flex-shrink-0 shadow-sm">
                      <h3 className="text-sm font-semibold text-slate-700">
                        Results View
                        {sparqlResult && (
                          <span className="ml-2 px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-xs font-normal border border-slate-200">
                            {sparqlResult.results.bindings.length} records
                          </span>
                        )}
                      </h3>
                      {sparqlResult && (
                        <button className="text-slate-400 hover:text-blue-600 flex items-center gap-1 text-xs transition-colors">
                          <Download size={14} /> Export CSV
                        </button>
                      )}
                    </div>
                    <div className="flex-1 overflow-auto bg-white custom-scrollbar">
                      {isLoading ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400">
                          <Loader2 className="animate-spin mb-2" size={32} />
                          <p className="text-sm animate-pulse">Running SPARQL query...</p>
                        </div>
                      ) : (
                        <ResultsTable data={sparqlResult} />
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
        </div>
      </main>
    </div>
  );
};

export default App;
