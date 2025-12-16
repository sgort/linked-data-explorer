import React, { useState, useEffect } from 'react';
import { Database, Search, Share2, Play, Settings, AlertCircle, Loader2, Sparkles, Code2, Link as LinkIcon, Download } from 'lucide-react';
import { DEFAULT_ENDPOINT, SAMPLE_QUERIES, COMMON_PREFIXES } from './constants';
import { executeSparqlQuery } from './services/sparqlService';
import { generateSparqlFromPrompt } from './services/geminiService';
import { ViewMode, SparqlResponse } from './types';
import GraphView from './components/GraphView';
import ResultsTable from './components/ResultsTable';

const App: React.FC = () => {
  // State
  const [endpoint, setEndpoint] = useState(DEFAULT_ENDPOINT);
  const [query, setQuery] = useState(SAMPLE_QUERIES[0].sparql);
  const [sparqlResult, setSparqlResult] = useState<SparqlResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.QUERY);
  const [showSettings, setShowSettings] = useState(false);
  
  // Gemini / Natural Language State
  const [nlPrompt, setNlPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Initialize API Key from env but don't show to user directly to edit if not needed
  // We assume process.env.API_KEY is available as per instructions.

  const handleRunQuery = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await executeSparqlQuery(endpoint, query);
      setSparqlResult(data);
      
      // Auto-switch to Visualize if asking for triples (s p o)
      if (query.includes('?s ?p ?o')) {
          setViewMode(ViewMode.VISUALIZE);
      }
    } catch (err: any) {
      setError(err.message || "An unknown error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateSparql = async () => {
    if (!nlPrompt.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      const generatedSparql = await generateSparqlFromPrompt(nlPrompt);
      setQuery(generatedSparql);
      setViewMode(ViewMode.QUERY); // Switch to query view to let user review code
    } catch (err: any) {
      setError("AI Generation failed: " + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSampleClick = (sampleQuery: string) => {
    setQuery(sampleQuery);
    setViewMode(ViewMode.QUERY);
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

          <button 
            onClick={() => setViewMode(ViewMode.NL_SEARCH)}
            className={`p-3 rounded-xl transition-all ${viewMode === ViewMode.NL_SEARCH ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            title="Ask AI"
          >
            <Sparkles size={24} />
          </button>
        </div>

        <button 
          onClick={() => setShowSettings(!showSettings)}
          className={`p-3 rounded-xl transition-all ${showSettings ? 'text-blue-400' : 'text-slate-400 hover:text-white'}`}
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
             <div className="hidden md:flex items-center bg-slate-100 rounded-md px-3 py-1.5 border border-slate-200">
                <span className="text-xs text-slate-500 mr-2 font-semibold">ENDPOINT:</span>
                <input 
                  type="text" 
                  value={endpoint} 
                  onChange={(e) => setEndpoint(e.target.value)}
                  className="bg-transparent text-sm text-slate-700 focus:outline-none w-64 font-mono"
                />
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
            <div className="absolute top-16 left-20 z-30 w-80 bg-white border border-slate-200 shadow-2xl rounded-br-xl rounded-bl-xl p-4 animate-in slide-in-from-left-4 fade-in duration-200">
              <h3 className="font-semibold text-slate-700 mb-3">Configuration</h3>
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-500 mb-1">Jena Endpoint URL</label>
                <input 
                  type="text" 
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <p className="text-xs text-slate-400">
                Ensure your Triple Store allows CORS from this origin. 
                For Jena, start with <code>--cors</code>.
              </p>
            </div>
          )}

          {/* Left Pane (Editors) */}
          {viewMode !== ViewMode.VISUALIZE && (
            <div className="w-1/2 md:w-[500px] border-r border-slate-200 bg-white flex flex-col h-full shadow-sm z-10 transition-all duration-300">
               
               {viewMode === ViewMode.NL_SEARCH && (
                 <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-indigo-50">
                    <h2 className="text-sm font-semibold text-indigo-900 mb-2 flex items-center gap-2">
                      <Sparkles size={16} className="text-indigo-600"/> 
                      AI Query Generator
                    </h2>
                    <textarea 
                      value={nlPrompt}
                      onChange={(e) => setNlPrompt(e.target.value)}
                      placeholder="e.g., Show me all rules valid from 2025"
                      className="w-full h-24 p-3 text-sm border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none bg-white text-slate-800"
                    />
                    <button 
                      onClick={handleGenerateSparql}
                      disabled={isGenerating || !nlPrompt}
                      className="mt-2 w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isGenerating ? <Loader2 className="animate-spin" size={14} /> : 'Generate SPARQL'}
                    </button>
                 </div>
               )}

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