'use client';

import {
  AT_QUESTION_COST_GUIDE_CONDITIONS,
  AT_QUESTION_COST_GUIDE_FOOTNOTE,
  AT_QUESTION_COST_GUIDE_TITLE,
  AT_QUESTION_TYPICAL_COST_JPY_LABEL,
  atQuestionTypicalCostHintJa,
} from '@/lib/at-question-cost-guide';

type AtQuestionCostGuideProps = {
  className?: string;
};

export function AtQuestionCostGuide({ className = '' }: AtQuestionCostGuideProps) {
  return (
    <div
      className={`rounded border border-amber-900/45 bg-amber-950/20 p-3 text-xs leading-relaxed ${className}`}
    >
      <p className="text-sm font-medium text-amber-100/95">{AT_QUESTION_COST_GUIDE_TITLE}</p>
      <p className="mt-1.5 text-gray-400">{AT_QUESTION_COST_GUIDE_CONDITIONS}</p>
      <p className="mt-2 text-gray-200">
        <span className="font-medium text-amber-100/90">通常: </span>
        <span className="text-emerald-300/95">{AT_QUESTION_TYPICAL_COST_JPY_LABEL}</span>
      </p>
      <p className="mt-1.5 text-gray-400">{atQuestionTypicalCostHintJa()}</p>
      <p className="mt-2.5 text-gray-500">{AT_QUESTION_COST_GUIDE_FOOTNOTE}</p>
    </div>
  );
}
