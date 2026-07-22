import { ChevronDown, ChevronUp } from 'lucide-react';
import React, { useState } from 'react';

import changelogData from '../changelog.json';

// ── Per-commit format (v2) ───────────────────────────────────────────
// A version entry with "format": "commits" is the new shape bump-release
// authors going forward — one bold, icon+color-coded header per commit
// (sha, author, type, subject, details), a scope badge (frontend / backend
// / both — this is a real npm workspaces monorepo, unlike the CPSV Editor),
// and status "Upcoming" | "Released" instead of a raw color key. Legacy
// entries (no "format" field, the "sections" shape rendered below) keep
// rendering exactly as before — forward-only, matching ronl-business-api
// and the CPSV Editor.
interface ChangelogCommit {
  sha: string;
  author: string;
  type: 'feat' | 'fix' | 'test' | 'docs' | 'chore' | 'refactor' | 'other';
  subject: string;
  details?: string[];
}

interface ChangelogVersionV2 {
  format: 'commits';
  version: string;
  status: string;
  date: string;
  scope: 'frontend' | 'backend' | 'both';
  commits: ChangelogCommit[];
}

// Legacy shape — matches every pre-existing entry in changelog.json. Kept
// here (rather than relying on the JSON module's inferred literal type) so
// the union below can describe a shape ("format": "commits") the current
// data doesn't have yet.
interface ChangelogSection {
  icon: string;
  iconColor: string;
  title: string;
  items: string[];
}

interface ChangelogVersion {
  version: string;
  status: string;
  statusColor: string;
  borderColor: string;
  date: string;
  sections: ChangelogSection[];
}

type ChangelogEntry = ChangelogVersion | ChangelogVersionV2;

const versions = changelogData.versions as ChangelogEntry[];

function isCommitFormat(version: ChangelogEntry): version is ChangelogVersionV2 {
  return 'format' in version && version.format === 'commits';
}

const COMMIT_TYPE_META: Record<ChangelogCommit['type'], { icon: string; color: string }> = {
  feat: { icon: '✨', color: 'text-green-700' },
  fix: { icon: '🐛', color: 'text-red-700' },
  test: { icon: '🧪', color: 'text-purple-700' },
  docs: { icon: '📘', color: 'text-blue-700' },
  chore: { icon: '🧹', color: 'text-gray-700' },
  refactor: { icon: '♻️', color: 'text-orange-700' },
  other: { icon: '📄', color: 'text-gray-700' },
};

const NEW_FORMAT_STATUS_BADGE: Record<string, string> = {
  Released: 'bg-green-100 text-green-700 border-green-300',
  Upcoming: 'bg-blue-100 text-blue-700 border-blue-300',
};

const NEW_FORMAT_BORDER: Record<string, string> = {
  Released: 'border-green-200',
  Upcoming: 'border-blue-200',
};

const SCOPE_BADGE: Record<ChangelogVersionV2['scope'], { label: string; cls: string }> = {
  frontend: { label: 'Frontend', cls: 'bg-blue-100 text-blue-700' },
  backend: { label: 'Backend', cls: 'bg-purple-100 text-purple-700' },
  both: { label: 'Full-stack', cls: 'bg-gray-200 text-gray-700' },
};

function ScopeBadge({ scope }: { scope: ChangelogVersionV2['scope'] }) {
  const config = SCOPE_BADGE[scope];
  return (
    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${config.cls}`}>
      {config.label}
    </span>
  );
}

function CommitBlock({ commit }: { commit: ChangelogCommit }) {
  const meta = COMMIT_TYPE_META[commit.type] || COMMIT_TYPE_META.other;
  return (
    <div className="flex items-start gap-2">
      <span className="text-xl leading-none flex-shrink-0">{meta.icon}</span>
      <div className="flex-1 min-w-0">
        <h4 className={`text-base font-bold ${meta.color}`}>{commit.subject}</h4>
        <p className="text-xs text-gray-400 font-mono mt-0.5">
          {commit.sha} — {commit.author}
        </p>
        {commit.details && commit.details.length > 0 && (
          <div className="mt-2 space-y-2">
            {commit.details.map((paragraph, i) => (
              <p key={i} className="text-sm text-slate-700 leading-relaxed">
                {paragraph}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const Changelog: React.FC = () => {
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(
    new Set([versions[0]?.version])
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
      teal: 'bg-teal-100 text-teal-700 border-teal-300',
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
      teal: 'text-teal-600',
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
      teal: 'border-teal-200',
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
          {versions.map((version) => {
            const isExpanded = expandedVersions.has(version.version);
            const commitFormat = isCommitFormat(version);
            const borderClass = commitFormat
              ? NEW_FORMAT_BORDER[version.status] || getBorderColor('gray')
              : getBorderColor(version.borderColor);
            const badgeClass = commitFormat
              ? NEW_FORMAT_STATUS_BADGE[version.status] || getStatusBadgeColor('gray')
              : getStatusBadgeColor(version.statusColor);

            return (
              <div
                key={version.version}
                className={`bg-white rounded-lg border-2 ${borderClass} shadow-sm transition-all hover:shadow-md`}
              >
                {/* Version Header */}
                <button
                  onClick={() => toggleVersion(version.version)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors rounded-t-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-2xl font-bold text-slate-800">v{version.version}</div>
                    {commitFormat && <ScopeBadge scope={version.scope} />}
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold border ${badgeClass}`}
                    >
                      {version.status}
                    </span>
                    <span className="text-sm text-slate-500">
                      {version.date}
                      {commitFormat &&
                        ` · ${version.commits.length} commit${version.commits.length === 1 ? '' : 's'}`}
                    </span>
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
                    {commitFormat ? (
                      <div className="space-y-5">
                        {version.commits.map((commit) => (
                          <CommitBlock key={commit.sha} commit={commit} />
                        ))}
                      </div>
                    ) : (
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
                    )}
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
              href="https://git.open-regels.nl/hosting/linked-data-explorer"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 font-medium hover:underline"
            >
              📦 GitLab Repository
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
