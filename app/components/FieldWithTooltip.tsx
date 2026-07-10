// components/FieldWithTooltip.tsx
import React from 'react';

interface FieldWithTooltipProps {
  label: string;
  tooltip: string;
  children: React.ReactNode;
}

export const FieldWithTooltip: React.FC<FieldWithTooltipProps> = ({ label, tooltip, children }) => {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        <span className="relative group inline-block ml-1 text-gray-400 hover:text-gray-600 cursor-help">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="absolute hidden group-hover:block bg-gray-800 text-white text-xs rounded p-2 w-64 -left-32 top-6 z-10 shadow-lg">
            {tooltip}
          </span>
        </span>
      </label>
      {children}
    </div>
  );
};