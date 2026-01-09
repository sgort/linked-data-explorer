import { Loader2 } from 'lucide-react';
import React from 'react';

import { DmnModel } from '../../types';

interface ExecutionProgressProps {
  chain: DmnModel[];
}

/**
 * Shows progress while chain is executing
 */
const ExecutionProgress: React.FC<ExecutionProgressProps> = ({ chain }) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Loader2 size={18} className="animate-spin text-blue-600" />
        <span className="font-medium text-slate-900">Executing Chain...</span>
      </div>

      <div className="space-y-2">
        {chain.map((dmn, index) => (
          <div key={dmn.identifier} className="flex items-center gap-2 text-sm">
            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium">
              {index + 1}
            </div>
            <span className="text-slate-600">{dmn.identifier}</span>
            <div className="flex-1 ml-2">
              <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full animate-pulse"
                  style={{ width: '60%' }}
                ></div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-500">This may take a few seconds...</p>
    </div>
  );
};

export default ExecutionProgress;
