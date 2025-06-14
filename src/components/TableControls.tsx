import React, { useState } from 'react';
import { Sliders, Columns } from 'lucide-react';
import { ColumnManager } from './ColumnManager';
import { useTheme } from '../context/ThemeContext';

interface TableControlsProps {
  onToggleFilters: () => void;
  isFilterPanelOpen: boolean;
  visibleColumns: string[];
  allColumns: string[];
  onColumnVisibilityChange: (column: string, isVisible: boolean) => void;
  columnOrder: string[];
  onColumnOrderChange: (newOrder: string[]) => void;
  totalRows: number;
}

export const TableControls: React.FC<TableControlsProps> = ({
  onToggleFilters,
  isFilterPanelOpen,
  visibleColumns,
  allColumns,
  onColumnVisibilityChange,
  columnOrder,
  onColumnOrderChange,
  totalRows
}) => {
  const { theme } = useTheme();
  const [isColumnManagerOpen, setIsColumnManagerOpen] = useState(false);
  
  return (
    <div className={`flex flex-wrap items-center justify-between gap-4 pb-3 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
      <div className="flex items-center gap-2">
        <p className="text-sm">
          <span className="font-medium">{totalRows}</span> results
        </p>
      </div>
      
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleFilters}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-md border transition-colors ${
            isFilterPanelOpen
              ? `${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-blue-50 border-blue-200'} text-blue-500`
              : `${theme === 'dark' ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' : 'bg-white border-gray-300 hover:bg-gray-50'}`
          }`}
        >
          <Sliders size={16} />
          <span className="text-sm">Filters</span>
        </button>
        
        <div className="relative">
          <button
            onClick={() => setIsColumnManagerOpen(!isColumnManagerOpen)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md border transition-colors ${
              isColumnManagerOpen
                ? `${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-blue-50 border-blue-200'} text-blue-500`
                : `${theme === 'dark' ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' : 'bg-white border-gray-300 hover:bg-gray-50'}`
            }`}
          >
            <Columns size={16} />
            <span className="text-sm">Columns</span>
          </button>
          
          {isColumnManagerOpen && (
            <div className="absolute right-0 top-full mt-2 z-10 w-72">
              <ColumnManager
                columns={allColumns}
                visibleColumns={visibleColumns}
                onColumnVisibilityChange={onColumnVisibilityChange}
                columnOrder={columnOrder}
                onColumnOrderChange={onColumnOrderChange}
                onClose={() => setIsColumnManagerOpen(false)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};