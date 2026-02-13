/* eslint-disable no-console */
import { Link2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { EnhancedChainLink, SemanticEquivalence } from '../../types';

interface SemanticViewProps {
  endpoint: string;
  apiBaseUrl: string;
}

const SemanticView: React.FC<SemanticViewProps> = ({ endpoint, apiBaseUrl }) => {
  const [equivalences, setEquivalences] = useState<SemanticEquivalence[]>([]);
  const [enhancedLinks, setEnhancedLinks] = useState<EnhancedChainLink[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [equivData, linksData] = await Promise.all([
        fetch(
          `${apiBaseUrl}/api/dmns/semantic-equivalences?endpoint=${encodeURIComponent(endpoint)}`
        ).then((r) => r.json()),
        fetch(
          `${apiBaseUrl}/api/dmns/enhanced-chain-links?endpoint=${encodeURIComponent(endpoint)}`
        ).then((r) => r.json()),
      ]);

      // Extract data from response objects
      setEquivalences(equivData.success && Array.isArray(equivData.data) ? equivData.data : []);
      setEnhancedLinks(linksData.success && Array.isArray(linksData.data) ? linksData.data : []);

      console.log('[SemanticView] Loaded:', {
        equivalences: equivData.data?.length || 0,
        enhancedLinks: linksData.data?.length || 0,
      });
    } catch (error) {
      console.error('Failed to load semantic data:', error);
      setEquivalences([]);
      setEnhancedLinks([]);
    } finally {
      setIsLoading(false);
    }
  };

  const semanticLinks = enhancedLinks.filter((l) => l.matchType === 'semantic');
  const exactLinks = enhancedLinks.filter((l) => l.matchType === 'exact');

  if (isLoading) {
    return <div className="p-4 text-center">Loading semantic analysis...</div>;
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-blue-600">{equivalences.length}</div>
          <div className="text-sm text-slate-600">Semantic Equivalences</div>
        </div>
        <div className="bg-emerald-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-emerald-600">{semanticLinks.length}</div>
          <div className="text-sm text-slate-600">Semantic Chain Links</div>
        </div>
        <div className="bg-slate-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-slate-600">{exactLinks.length}</div>
          <div className="text-sm text-slate-600">Exact Match Links</div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Link2 size={18} />
          Semantic Chain Suggestions
        </h3>
        {semanticLinks.length === 0 ? (
          <div className="text-sm text-slate-500 bg-slate-50 p-4 rounded-lg">
            No semantic chain links found. Variables match by exact identifier only.
          </div>
        ) : (
          <div className="space-y-2">
            {semanticLinks.map((link, idx) => (
              <div key={idx} className="bg-white border border-slate-200 p-3 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">{link.dmn1.title}</span>
                  <span className="text-emerald-600 font-mono text-xs px-2 py-1 bg-emerald-50 rounded">
                    semantic
                  </span>
                  <span className="font-medium text-sm">{link.dmn2.title}</span>
                </div>
                <div className="text-xs text-slate-600">
                  <div>
                    Output: <code>{link.outputVariable}</code>
                  </div>
                  <div>
                    Input: <code>{link.inputVariable}</code>
                  </div>
                  <div>
                    Via concept:{' '}
                    <code className="text-blue-600">{link.sharedConcept.split('/').pop()}</code>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-3">Semantic Equivalences</h3>
        {equivalences.length === 0 ? (
          <div className="text-sm text-slate-500 bg-slate-50 p-4 rounded-lg">
            No semantic equivalences found via skos:exactMatch.
          </div>
        ) : (
          <div className="space-y-3">
            {equivalences.map((equiv, idx) => (
              <div key={idx} className="bg-white border border-slate-200 p-4 rounded-lg">
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <div className="font-medium text-sm mb-1">{equiv.dmn1.title}</div>
                    <div className="text-xs text-slate-600">
                      {equiv.concept1.label}{' '}
                      {equiv.concept1.notation && `(${equiv.concept1.notation})`}
                    </div>
                    <div className="text-xs font-mono text-blue-600">
                      {equiv.concept1.variable.identifier}
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1 min-w-[140px]">
                    <Link2 size={16} className="text-emerald-600" />
                    <div className="text-[10px] text-slate-500">via</div>
                    <div
                      className="text-xs font-mono text-emerald-600 text-center break-all"
                      title={equiv.sharedConcept}
                    >
                      {equiv.sharedConcept.split('/').pop()}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-sm mb-1">{equiv.dmn2.title}</div>
                    <div className="text-xs text-slate-600">
                      {equiv.concept2.label}{' '}
                      {equiv.concept2.notation && `(${equiv.concept2.notation})`}
                    </div>
                    <div className="text-xs font-mono text-blue-600">
                      {equiv.concept2.variable.identifier}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SemanticView;
