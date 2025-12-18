import React, { useState, useEffect } from 'react';
import { Database, Share2, Play, Settings, AlertCircle, Loader2, Code2, Download, Plus, Trash2 } from 'lucide-react';
import { APP_VERSION, DEFAULT_ENDPOINT, SAMPLE_QUERIES, COMMON_PREFIXES, PRESET_ENDPOINTS } from './constants';
import { executeSparqlQuery } from './services/sparqlService';
import { ViewMode, SparqlResponse } from './types';
import GraphView from './components/GraphView';
import ResultsTable from './components/ResultsTable';

const STORAGE_KEY_ENDPOINTS = 'lde_saved_endpoints';
const STORAGE_KEY_LAST_ENDPOINT = 'lde_last_endpoint';
const STORAGE_KEY_VERSION = 'lde_app_version';

const App: React.FC = () => {
  // 1. Initial State & Migration Logic
  const [savedEndpoints, setSavedEndpoints] = useState(() => {
    try {
      const storedVersion = localStorage.getItem(STORAGE_KEY_VERSION);
      
      // If version is missing or old, ignore storage and use new constants
      if (!storedVersion || storedVersion !== APP_VERSION) {
        return PRESET_ENDPOINTS;
      }

      const stored = localStorage.getItem(STORAGE_KEY_ENDPOINTS);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn("Failed to load endpoints from storage", e);
    }
    return PRESET_ENDPOINTS;
  });

  const [endpoint, setEndpoint] = useState(() => {
    const storedVersion = localStorage.getItem(STORAGE_KEY_VERSION);
    // If migration needed, force the new default
    if (!storedVersion || storedVersion !== APP_VERSION) {
      return PRESET_ENDPOINTS[3].url;
    }
    return localStorage.getItem(STORAGE_KEY_LAST_ENDPOINT) || PRESET_ENDPOINTS[3].url;
  });

  const [query, setQuery] = useState(SAMPLE_QUERIES[0].sparql);
  const [sparqlResult, setSparqlResult] = useState<SparqlResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.QUERY);
  const [showSettings, setShowSettings] = useState(false);
  
  // Endpoint Management State
  const [newEndpointName, setNewEndpointName] = useState('');
  const [newEndpointUrl, setNewEndpointUrl] = useState('');

  // 2. Persistance Effects
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ENDPOINTS, JSON.stringify(savedEndpoints));
      localStorage.setItem(STORAGE_KEY_VERSION, APP_VERSION);
    } catch (e) {
      console.warn("Failed to save endpoints", e);
    }
  }, [savedEndpoints]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_LAST_ENDPOINT, endpoint);
  }, [endpoint]);

  // 3. Handlers
  const handleRunQuery = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await executeSparqlQuery(endpoint, query);
      setSparqlResult(data);
      
      if (query.includes('?s ?p ?o')) {
          setViewMode(ViewMode.VISUALIZE);
      }
    } catch (err: any) {
      setError(err.message || "An unknown error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSampleClick = (sampleQuery: string) => {
    setQuery(sampleQuery);
    setViewMode(ViewMode.QUERY);
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
    if (confirm("Reset endpoints to default system presets?")) {
      setSavedEndpoints(PRESET_ENDPOINTS);
      setEndpoint(PRESET_ENDPOINTS[3].url);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      
      {/* Sidebar */}
      <div className="w-16 md:w-20 bg-slate-900 flex flex-col items-center py-6 gap-6 z-20 flex-shrink-0">
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
            onClick={() => setViewMode(ViewMode.VISUALIZE)}
            className={`p-3 rounded-xl transition-all ${viewMode === ViewMode.VISUALIZE ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            title="Graph Visualization"
          >
            <Share2 size={24} />
          </button>
        </div>

        <button 
          onClick={() => setShowSettings(!showSettings)}
          className={`p-3 rounded-xl transition-all ${showSettings ? 'text-blue-400' : 'text-slate-400 hover:text-white'}`}
          title="Settings"
        >
          <Settings size={24} />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
             <h1 className="text-xl font-bold text-slate-800 tracking-tight">Linked Data Explorer</h1>
             <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium border border-blue-200">
               Regels Overheid
             </span>
          </div>

          <div className="flex items-center gap-3">
             <div className="hidden md:flex items-center bg-slate-100 rounded-md px-3 py-1.5 border border-slate-200 relative group">
                <span className="text-xs text-slate-500 mr-2 font-semibold">ENDPOINT:</span>
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
                    <option key={idx} value={ep.url}>{ep.name}</option>
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
               {isLoading ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} fill="currentColor" />}
               Run Query
             </button>
          </div>
        </header>

        {/* Workspace */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Settings Panel Overlay */}
          {showSettings && (
            <div className="absolute top-16 left-20 z-30 w-[450px] bg-white border border-slate-200 shadow-2xl rounded-br-xl rounded-bl-xl p-5 animate-in slide-in-from-left-4 fade-in duration-200 flex flex-col max-h-[calc(100vh-100px)] overflow-hidden">
              <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-2">
                <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                  <Settings size={18} /> Configuration
                </h3>
                <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600">×</button>
              </div>

              <div className="space-y-4 overflow-y-auto pr-1 custom-scrollbar">
                
                {/* Active Endpoint */}
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wider">Active Endpoint</label>
                  <input 
                    type="text" 
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono text-slate-600"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                     Ensure your Triple Store allows CORS from this origin.
                  </p>
                </div>

                <hr className="border-slate-100" />

                {/* Manage Endpoints */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Saved Endpoints</label>
                    <button onClick={handleResetDefaults} className="text-[10px] text-blue-500 hover:underline">Reset to Default</button>
                  </div>
                  
                  <div className="space-y-2 mb-3">
                    {savedEndpoints.map((ep, idx) => (
                      <div key={idx} className="flex items-center justify-between group p-2 rounded hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all">
                        <div 
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => { setEndpoint(ep.url); }}
                        >
                          <div className="text-sm font-medium text-slate-700 truncate">{ep.name}</div>
                          <div className="text-[10px] text-slate-400 truncate font-mono">{ep.url}</div>
                        </div>
                        <div className="flex items-center gap-2">
                           {endpoint === ep.url && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Active</span>}
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

                  {/* Add New */}
                  <div className="bg-slate-50 p-3 rounded border border-slate-200">
                    <div className="text-xs font-medium text-slate-500 mb-2">Add New Endpoint</div>
                    <input 
                      type="text" 
                      placeholder="Name (e.g. Production DB)"
                      value={newEndpointName}
                      onChange={(e) => setNewEndpointName(e.target.value)}
                      className="w-full mb-2 border border-slate-300 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder="URL (e.g. https://.../sparql)"
                        value={newEndpointUrl}
                        onChange={(e) => setNewEndpointUrl(e.target.value)}
                        className="flex-1 border border-slate-300 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none font-mono"
                      />
                      <button 
                        onClick={handleAddEndpoint}
                        disabled={!newEndpointName || !newEndpointUrl}
                        className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1 rounded text-xs font-medium disabled:opacity-50 transition-colors"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          )}

          {/* Left Pane (Editors) */}
          {viewMode !== ViewMode.VISUALIZE && (
            <div className="w-1/2 md:w-[500px] border-r border-slate-200 bg-white flex flex-col h-full shadow-sm z-10 transition-all duration-300">
               
               <div className="flex-1 flex flex-col min-h-0">
                 <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200">
                   <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">SPARQL Query</span>
                   <div className="flex gap-2">
                      <button className="text-slate-400 hover:text-blue-600" title="Copy">
                        <Code2 size={14} />
                      </button>
                   </div>
                 </div>
                 <textarea 
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="flex-1 w-full p-4 font-mono text-sm text-slate-800 bg-white focus:outline-none resize-none leading-relaxed code-scroll"
                    spellCheck={false}
                 />
               </div>

               <div className="h-1/3 border-t border-slate-200 flex flex-col bg-slate-50">
                  <div className="px-4 py-2 border-b border-slate-200 flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-500 uppercase">Sample Queries</span>
                  </div>
                  <div className="overflow-y-auto flex-1 p-2 space-y-1">
                    {SAMPLE_QUERIES.map((q, idx) => (
                      <button 
                        key={idx}
                        onClick={() => handleSampleClick(q.sparql)}
                        className="w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-white hover:text-blue-600 rounded-md border border-transparent hover:border-slate-200 transition-colors truncate"
                      >
                        {q.name}
                      </button>
                    ))}
                  </div>
               </div>
            </div>
          )}

          {/* Right Pane (Results) */}
          <div className="flex-1 bg-slate-50 relative flex flex-col min-w-0">
            {error && (
              <div className="absolute top-4 left-4 right-4 z-50 bg-red-50 text-red-700 px-4 py-3 rounded-lg border border-red-200 shadow-sm flex items-start gap-3">
                <AlertCircle className="flex-shrink-0 mt-0.5" size={18} />
                <div className="text-sm whitespace-pre-wrap font-medium">{error}</div>
                <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-700">×</button>
              </div>
            )}

            {viewMode === ViewMode.VISUALIZE ? (
              <div className="flex-1 p-4 h-full">
                <GraphView data={sparqlResult} />
              </div>
            ) : (
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                <div className="px-6 py-3 border-b border-slate-200 bg-white flex justify-between items-center">
                  <h3 className="text-sm font-semibold text-slate-700">
                    Results 
                    {sparqlResult && <span className="ml-2 px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-xs font-normal">{sparqlResult.results.bindings.length} rows</span>}
                  </h3>
                  {sparqlResult && (
                     <button className="text-slate-400 hover:text-blue-600 flex items-center gap-1 text-xs">
                       <Download size={14} /> Export CSV
                     </button>
                  )}
                </div>
                <div className="flex-1 overflow-auto bg-white">
                  {isLoading ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                      <Loader2 className="animate-spin mb-2" size={32} />
                      <p className="text-sm">Executing query...</p>
                    </div>
                  ) : (
                    <ResultsTable data={sparqlResult} />
                  )}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default App;