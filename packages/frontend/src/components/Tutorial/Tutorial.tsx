import { ChevronDown, ChevronUp, Clock, GraduationCap, Lightbulb } from 'lucide-react';
import React, { useRef, useState } from 'react';

import tutorialData from '../../tutorial.json';

interface TutorialStep {
  number: number;
  title: string;
  description: string;
  action: string;
  details: string[];
  tip: string;
}

interface Tutorial {
  id: string;
  title: string;
  description: string;
  icon: string;
  iconColor: string;
  difficulty: string;
  estimatedTime: string;
  steps: TutorialStep[];
}

interface GlossaryTerm {
  term: string;
  definition: string;
}

const Tutorial: React.FC = () => {
  const [expandedTutorials, setExpandedTutorials] = useState<Set<string>>(
    new Set([tutorialData.tutorials[0]?.id])
  );
  const [showGlossary, setShowGlossary] = useState(false);

  // Create refs for each tutorial card for auto-scrolling
  const tutorialRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const glossaryRef = useRef<HTMLDivElement | null>(null);

  const toggleTutorial = (id: string) => {
    if (expandedTutorials.has(id)) {
      // If clicking the currently open tutorial, close it
      setExpandedTutorials(new Set());
    } else {
      // Otherwise, close all others and open this one
      setExpandedTutorials(new Set([id]));

      // Auto-scroll to the opened tutorial after a brief delay for expansion animation
      setTimeout(() => {
        tutorialRefs.current[id]?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 100);
    }
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
      orange: 'text-orange-600',
    };
    return colors[color] || colors.blue;
  };

  const getDifficultyColor = (difficulty: string) => {
    const colors: Record<string, string> = {
      Beginner: 'bg-green-100 text-green-700 border-green-300',
      Intermediate: 'bg-blue-100 text-blue-700 border-blue-300',
      Advanced: 'bg-purple-100 text-purple-700 border-purple-300',
      'All Levels': 'bg-slate-100 text-slate-700 border-slate-300',
    };
    return colors[difficulty] || colors.Beginner;
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
      orange: 'border-orange-200',
    };
    return colors[color] || colors.blue;
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6 custom-scrollbar">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <GraduationCap size={32} className="text-blue-600" />
            <h1 className="text-3xl font-bold text-slate-800">{tutorialData.title}</h1>
          </div>
          <p className="text-slate-600 text-lg">{tutorialData.subtitle}</p>
        </div>

        {/* Quick Links */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
            <span className="text-xl">🎯</span>
            Jump to Tutorial
          </h3>
          <div className="flex flex-wrap gap-2">
            {tutorialData.tutorials.map((tutorial) => (
              <button
                key={tutorial.id}
                onClick={() => {
                  const newExpanded = new Set([tutorial.id]);
                  setExpandedTutorials(newExpanded);
                  // Auto-scroll to tutorial after expanding
                  setTimeout(() => {
                    tutorialRefs.current[tutorial.id]?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    });
                  }, 100);
                }}
                className="px-3 py-1.5 text-sm bg-white border border-blue-300 text-blue-700 rounded-md hover:bg-blue-100 transition-colors"
              >
                {tutorial.icon} {tutorial.title}
              </button>
            ))}
            <button
              onClick={() => {
                setShowGlossary(!showGlossary);
                if (!showGlossary) {
                  setTimeout(() => {
                    glossaryRef.current?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    });
                  }, 100);
                }
              }}
              className="px-3 py-1.5 text-sm bg-white border border-slate-300 text-slate-700 rounded-md hover:bg-slate-100 transition-colors"
            >
              📖 Glossary
            </button>
          </div>
        </div>

        {/* Tutorial List */}
        <div className="space-y-4">
          {tutorialData.tutorials.map((tutorial: Tutorial) => {
            const isExpanded = expandedTutorials.has(tutorial.id);

            return (
              <div
                key={tutorial.id}
                id={tutorial.id}
                ref={(el) => {
                  tutorialRefs.current[tutorial.id] = el;
                }}
                className={`bg-white rounded-lg border-2 ${getBorderColor(tutorial.iconColor)} shadow-sm transition-all hover:shadow-md`}
              >
                {/* Tutorial Header */}
                <button
                  onClick={() => toggleTutorial(tutorial.id)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors rounded-t-lg"
                >
                  <div className="flex items-center gap-4">
                    <span className={`text-3xl ${getIconColor(tutorial.iconColor)}`}>
                      {tutorial.icon}
                    </span>
                    <div className="text-left">
                      <h2 className="text-xl font-bold text-slate-800">{tutorial.title}</h2>
                      <p className="text-sm text-slate-600 mt-1">{tutorial.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold border ${getDifficultyColor(tutorial.difficulty)}`}
                    >
                      {tutorial.difficulty}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <Clock size={14} />
                      {tutorial.estimatedTime}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="text-slate-400" size={20} />
                    ) : (
                      <ChevronDown className="text-slate-400" size={20} />
                    )}
                  </div>
                </button>

                {/* Tutorial Steps */}
                {isExpanded && (
                  <div className="px-6 pb-6 pt-2 border-t border-slate-100">
                    <div className="space-y-6">
                      {tutorial.steps.map((step) => (
                        <div
                          key={step.number}
                          className="relative pl-12 pb-6 border-l-2 border-slate-200 last:border-l-0 last:pb-0"
                        >
                          {/* Step Number Badge */}
                          <div className="absolute -left-5 top-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold shadow-md">
                            {step.number}
                          </div>

                          {/* Step Content */}
                          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                            <h4 className="text-lg font-semibold text-slate-800 mb-2">
                              {step.title}
                            </h4>
                            <p className="text-slate-700 mb-3">{step.description}</p>

                            {/* Action Box */}
                            <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-3">
                              <div className="flex items-start gap-2">
                                <span className="text-blue-600 font-bold text-sm mt-0.5">▶</span>
                                <div>
                                  <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                                    Action
                                  </span>
                                  <p className="text-sm text-blue-900 mt-1 font-medium">
                                    {step.action}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Details List */}
                            {step.details && step.details.length > 0 && (
                              <div className="mb-3">
                                <h5 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                                  Details
                                </h5>
                                <ul className="space-y-1.5">
                                  {step.details.map((detail, idx) => (
                                    <li
                                      key={idx}
                                      className="text-sm text-slate-600 flex items-start gap-2"
                                    >
                                      <span className="text-slate-400 mt-1 flex-shrink-0">•</span>
                                      <span>{detail}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Tip Box */}
                            {step.tip && (
                              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 flex items-start gap-2">
                                <Lightbulb
                                  size={16}
                                  className="text-yellow-600 mt-0.5 flex-shrink-0"
                                />
                                <p className="text-sm text-yellow-900">{step.tip}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Glossary Section */}
        <div
          id="glossary"
          ref={glossaryRef}
          className="mt-8 bg-white rounded-lg border-2 border-slate-200 shadow-sm overflow-hidden"
        >
          <button
            onClick={() => setShowGlossary(!showGlossary)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">📖</span>
              <h2 className="text-xl font-bold text-slate-800">Glossary</h2>
              <span className="text-sm text-slate-500">({tutorialData.glossary.length} terms)</span>
            </div>
            {showGlossary ? (
              <ChevronUp className="text-slate-400" size={20} />
            ) : (
              <ChevronDown className="text-slate-400" size={20} />
            )}
          </button>

          {showGlossary && (
            <div className="px-6 pb-6 pt-2 border-t border-slate-100">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tutorialData.glossary.map((item: GlossaryTerm, idx: number) => (
                  <div key={idx} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                    <h4 className="font-semibold text-slate-800 mb-1">{item.term}</h4>
                    <p className="text-sm text-slate-600">{item.definition}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
            <span className="text-xl">💬</span>
            Need More Help?
          </h3>
          <div className="space-y-2 text-sm text-blue-800">
            <p>If you encounter issues or have questions not covered in these tutorials, please:</p>
            <ul className="space-y-1 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-1">•</span>
                <span>
                  Check the{' '}
                  <a
                    href="https://git.open-regels.nl/hosting/linked-data-explorer/-/issues"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700 font-medium underline"
                  >
                    GitLab Issues
                  </a>{' '}
                  for known problems
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-1">•</span>
                <span>
                  Review the{' '}
                  <a
                    href="https://git.open-regels.nl/hosting/linked-data-explorer/-/blob/main/README.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700 font-medium underline"
                  >
                    README documentation
                  </a>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-1">•</span>
                <span>Contact the development team for technical support</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-1">•</span>
                <span>
                  Visit{' '}
                  <a
                    href="https://regels.overheid.nl"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700 font-medium underline"
                  >
                    Regels Overheid
                  </a>{' '}
                  for project information
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Tutorial;
