import { ChevronDown, ChevronUp } from 'lucide-react';
import React, { useState } from 'react';

import changelogData from '../changelog.json';

const Changelog: React.FC = () => {
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(
    new Set([changelogData.versions[0]?.version])
  );

  const toggleVersion = (version: string) => {
    const newExpanded = new Set(expandedVersions);
    if (newExpanded.has(version)) {
      newExpanded.delete(version);
    } else {
      newExpanded.add(version);
    }
    setExpandedVersions(newExpanded);
  };

  const getStatusBadgeColor = (color: string) => {
    const colors: Record<string, string> = {
      emerald: 'bg-emerald-100 text-emerald-700 border-emerald-300',
      green: 'bg-green-100 text-green-700 border-green-300',
      blue: 'bg-blue-100 text-blue-700 border-blue-300',
      purple: 'bg-purple-100 text-purple-700 border-purple-300',
      indigo: 'bg-indigo-100 text-indigo-700 border-indigo-300',
      red: 'bg-red-100 text-red-700 border-red-300',
      yellow: 'bg-yellow-100 text-yellow-700 border-yellow-300',
      gray: 'bg-gray-100 text-gray-700 border-gray-300',
    };
    return colors[color] || colors.gray;
  };

  const getIconColor = (color: string) => {
    const colors: Record<string, string> = {
      emerald: 'text-emerald-600',
      green: 'text-green-600',
      blue: 'text-blue-600',
      purple: 'text-purple-600',
      indigo: 'text-indigo-600',
      red: 'text-red-600',
      yellow: 'text-yellow-600',
      gray: 'text-gray-600',
    };
    return colors[color] || colors.gray;
  };

  const getBorderColor = (color: string) => {
    const colors: Record<string, string> = {
      emerald: 'border-emerald-200',
      green: 'border-green-200',
      blue: 'border-blue-200',
      purple: 'border-purple-200',
      indigo: 'border-indigo-200',
      red: 'border-red-200',
      yellow: 'border-yellow-200',
      gray: 'border-gray-200',
    };
    return colors[color] || colors.gray;
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6 custom-scrollbar">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">Changelog</h1>
          <p className="text-slate-600">
            Track new features, improvements, and bug fixes in Linked Data Explorer.
          </p>
        </div>

        {/* Version List */}
        <div className="space-y-4">
          {changelogData.versions.map((version) => {
            const isExpanded = expandedVersions.has(version.version);

            return (
              <div
                key={version.version}
                className={`bg-white rounded-lg border-2 ${getBorderColor(version.borderColor)} shadow-sm transition-all hover:shadow-md`}
              >
                {/* Version Header */}
                <button
                  onClick={() => toggleVersion(version.version)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors rounded-t-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-2xl font-bold text-slate-800">v{version.version}</div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusBadgeColor(version.statusColor)}`}
                    >
                      {version.status}
                    </span>
                    <span className="text-sm text-slate-500">{version.date}</span>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="text-slate-400" size={20} />
                  ) : (
                    <ChevronDown className="text-slate-400" size={20} />
                  )}
                </button>

                {/* Version Content */}
                {isExpanded && (
                  <div className="px-6 pb-6 pt-2 border-t border-slate-100">
                    <div className="space-y-6">
                      {version.sections.map((section, idx) => (
                        <div key={idx}>
                          {/* Section Header */}
                          <div className="flex items-center gap-2 mb-3">
                            <span className={`text-2xl ${getIconColor(section.iconColor)}`}>
                              {section.icon}
                            </span>
                            <h3 className="text-lg font-semibold text-slate-700">
                              {section.title}
                            </h3>
                          </div>

                          {/* Section Items */}
                          <ul className="space-y-2 ml-8">
                            {section.items.map((item, itemIdx) => (
                              <li
                                key={itemIdx}
                                className="text-slate-600 flex items-start gap-2 text-sm leading-relaxed"
                              >
                                <span className="text-blue-500 mt-1.5 flex-shrink-0">•</span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-12 p-6 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
            <span className="text-xl">💡</span>
            About This Project
          </h3>
          <p className="text-sm text-blue-800 leading-relaxed mb-3">
            Linked Data Explorer is a tool for visualizing and querying SPARQL endpoints, with a
            focus on Dutch Government Data (Regels Overheid). Built with React, TypeScript, and
            D3.js.
          </p>
          <div className="flex flex-wrap gap-4 text-xs">
            <a
              href="https://github.com/yourorg/linked-data-explorer"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 font-medium hover:underline"
            >
              📦 GitHub Repository
            </a>
            <a
              href="https://acc.linkeddata.open-regels.nl"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 font-medium hover:underline"
            >
              🌐 Live Demo (ACC)
            </a>
            <a
              href="https://linkeddata.open-regels.nl"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 font-medium hover:underline"
            >
              🚀 Production Site
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Changelog;
