import React, { useState } from 'react';
import { X, Filter, ChevronDown, ChevronUp, EyeOff } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { ALWAYS_HIDDEN_COLUMNS } from '../config/columnConfig';

// Function to normalize column names (remove BOM and other invisible characters)
const normalizeColumnName = (columnName: string): string => {
  return columnName.replace(/^\uFEFF/, '').trim();
};

interface FilterPanelProps {
  columns: string[];
  onFilterChange: (column: string, filter: any) => void;
  filters: Record<string, any>;
  className?: string;
  columnTypes: Record<string, 'string' | 'number'>;
  hideUnknownMacros?: boolean;
  onHideUnknownMacrosChange?: (hide: boolean) => void;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  columns,
  onFilterChange,
  filters,
  className = '',
  columnTypes,
  hideUnknownMacros = false,
  onHideUnknownMacrosChange
}) => {
  const { theme } = useTheme();
  const [expandedColumn, setExpandedColumn] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Temporary inputs for contains/exclude per column
  const [containsInputs, setContainsInputs] = useState<Record<string, string>>({});
  const [excludeInputs, setExcludeInputs] = useState<Record<string, string>>({});
  
  // Helper to add a pattern to a filter field
  const addPattern = (column: string, field: 'contains' | 'exclude', pattern: string) => {
    const trimmed = pattern.trim();
    if (!trimmed) return;

    const current = filters[column] && typeof filters[column] === 'object' ? filters[column] : {};

    const existingPatterns: string[] = Array.isArray(current[field])
      ? current[field]
      : current[field]
      ? [current[field]]
      : [];

    if (existingPatterns.includes(trimmed)) return; // avoid duplicates

    const updatedPatterns = [...existingPatterns, trimmed];
    const updated = { ...current, [field]: updatedPatterns };

    onFilterChange(column, updated);
  };

  // Helper to remove a pattern
  const removePattern = (column: string, field: 'contains' | 'exclude', pattern: string) => {
    const current = filters[column] && typeof filters[column] === 'object' ? filters[column] : {};
    const existingPatterns: string[] = Array.isArray(current[field]) ? current[field] : [];
    const updatedPatterns = existingPatterns.filter(p => p !== pattern);

    const updated = { ...current, [field]: updatedPatterns };

    // Clean up empty fields
    if (updatedPatterns.length === 0) delete updated[field];

    if (!updated.contains && !updated.exclude) {
      onFilterChange(column, undefined);
    } else {
      onFilterChange(column, updated);
    }
  };
  
  const handleNumberFilterChange = (column: string, type: 'equals' | 'range', value: any) => {
    if (type === 'equals') {
      if (value === '') {
        const newFilters = { ...filters };
        delete newFilters[column];
        onFilterChange(column, undefined);
      } else {
        onFilterChange(column, {
          type: 'equals',
          value: parseFloat(value)
        });
      }
    } else {
      const { min, max } = value;
      if (!min && !max) {
        const newFilters = { ...filters };
        delete newFilters[column];
        onFilterChange(column, undefined);
      } else {
        onFilterChange(column, {
          type: 'range',
          min: min === '' ? null : parseFloat(min),
          max: max === '' ? null : parseFloat(max)
        });
      }
    }
  };
  
  const handleStringContainsChange = (column: string, value: string) => {
    const current = filters[column] && typeof filters[column] === 'object' ? filters[column] : {};
    const updated = { ...current, contains: value.trim() || undefined };
    // Remove undefined fields
    if (!updated.contains) delete updated.contains;
    if (!updated.exclude) delete updated.exclude;
    if (Object.keys(updated).length === 0) {
      const newFilters = { ...filters };
      delete newFilters[column];
      onFilterChange(column, undefined);
    } else {
      onFilterChange(column, updated);
    }
  };
  
  const handleStringExcludeChange = (column: string, value: string) => {
    const current = filters[column] && typeof filters[column] === 'object' ? filters[column] : {};
    const updated = { ...current, exclude: value.trim() || undefined };
    if (!updated.contains) delete updated.contains;
    if (!updated.exclude) delete updated.exclude;
    if (Object.keys(updated).length === 0) {
      const newFilters = { ...filters };
      delete newFilters[column];
      onFilterChange(column, undefined);
    } else {
      onFilterChange(column, updated);
    }
  };
  
  const clearFilter = (column: string) => {
    const newFilters = { ...filters };
    delete newFilters[column];
    onFilterChange(column, undefined);
  };
  
  const clearAllFilters = () => {
    columns.forEach(column => {
      onFilterChange(column, undefined);
    });
    if (onHideUnknownMacrosChange) {
      onHideUnknownMacrosChange(false);
    }
  };
  
  const filteredColumns = columns.filter(column => {
    const normalizedColumn = normalizeColumnName(column);
    return column.toLowerCase().includes(searchQuery.toLowerCase()) &&
           !ALWAYS_HIDDEN_COLUMNS.includes(normalizedColumn);
  });
  
  const hasActiveFilters = Object.keys(filters).length > 0 || hideUnknownMacros;
  
  return (
    <div className={`${className}`}>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <Filter size={18} className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} />
          <h3 className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            Filters
          </h3>
          {hasActiveFilters && (
            <span className="inline-flex items-center justify-center w-5 h-5 bg-blue-500 text-white text-xs font-medium rounded-full">
              {Object.keys(filters).length + (hideUnknownMacros ? 1 : 0)}
            </span>
          )}
        </div>
        
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="text-sm text-blue-500 hover:text-blue-600 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>
      
      {/* Hide Unknown Macros Toggle */}
      {onHideUnknownMacrosChange && (
        <div className={`mb-4 p-3 rounded-md ${
          theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'
        }`}>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hideUnknownMacros}
              onChange={(e) => onHideUnknownMacrosChange(e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
            />
            <EyeOff size={16} className={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} />
            <span className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              Hide meals with unknown macros
            </span>
          </label>
        </div>
      )}
      
      <div className="mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search columns..."
          className={`w-full px-3 py-2 rounded-md border ${
            theme === 'dark' 
              ? 'bg-gray-700 text-white border-gray-600 placeholder-gray-400' 
              : 'bg-white text-gray-900 border-gray-300 placeholder-gray-500'
          } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
        />
      </div>
      
      <div className="overflow-y-auto max-h-[calc(100vh-280px)] -mr-2 pr-2">
        <div className="space-y-2">
          {filteredColumns.map((column) => {
            const isExpanded = expandedColumn === column;
            const hasFilter = filters[column] !== undefined;
            const columnType = columnTypes[column] || 'string';
            
            return (
              <div 
                key={column}
                className={`${
                  theme === 'dark' 
                    ? 'bg-gray-700 hover:bg-gray-600' 
                    : 'bg-gray-50 hover:bg-gray-100'
                } rounded-md overflow-hidden transition-colors`}
              >
                <div 
                  className="flex items-center justify-between p-3 cursor-pointer"
                  onClick={() => setExpandedColumn(isExpanded ? null : column)}
                >
                  <div className="flex items-center">
                    {hasFilter && (
                      <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                    )}
                    <span className={`truncate ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      {column}
                    </span>
                  </div>
                  <div className="flex items-center">
                    {hasFilter && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          clearFilter(column);
                        }}
                        className="mr-2 p-1 rounded-full hover:bg-gray-500 hover:bg-opacity-20"
                        aria-label={`Clear filter for ${column}`}
                      >
                        <X size={14} className={theme === 'dark' ? 'text-gray-300' : 'text-gray-600'} />
                      </button>
                    )}
                    {isExpanded ? (
                      <ChevronUp size={16} className={theme === 'dark' ? 'text-gray-300' : 'text-gray-600'} />
                    ) : (
                      <ChevronDown size={16} className={theme === 'dark' ? 'text-gray-300' : 'text-gray-600'} />
                    )}
                  </div>
                </div>
                
                {isExpanded && (
                  <div className={`p-3 border-t ${theme === 'dark' ? 'border-gray-600' : 'border-gray-200'}`}>
                    {columnType === 'number' ? (
                      <div className="space-y-3">
                        <div>
                          <label className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                            Equals
                          </label>
                          <input
                            type="number"
                            value={filters[column]?.type === 'equals' ? filters[column].value : ''}
                            onChange={(e) => handleNumberFilterChange(column, 'equals', e.target.value)}
                            placeholder="Enter value..."
                            className={`w-full px-3 py-1.5 rounded-md border text-sm ${
                              theme === 'dark' 
                                ? 'bg-gray-600 text-white border-gray-500 placeholder-gray-400' 
                                : 'bg-white text-gray-900 border-gray-300 placeholder-gray-500'
                            } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                          />
                        </div>
                        
                        <div>
                          <label className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                            Range
                          </label>
                          <div className="flex items-center space-x-2">
                            <input
                              type="number"
                              value={filters[column]?.type === 'range' ? filters[column].min ?? '' : ''}
                              onChange={(e) => {
                                const min = e.target.value;
                                const max = filters[column]?.type === 'range' ? filters[column].max : null;
                                handleNumberFilterChange(column, 'range', { min, max });
                              }}
                              placeholder="Min"
                              className={`w-1/2 px-3 py-1.5 rounded-md border text-sm ${
                                theme === 'dark' 
                                  ? 'bg-gray-600 text-white border-gray-500 placeholder-gray-400' 
                                  : 'bg-white text-gray-900 border-gray-300 placeholder-gray-500'
                              } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                            />
                            <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>to</span>
                            <input
                              type="number"
                              value={filters[column]?.type === 'range' ? filters[column].max ?? '' : ''}
                              onChange={(e) => {
                                const max = e.target.value;
                                const min = filters[column]?.type === 'range' ? filters[column].min : null;
                                handleNumberFilterChange(column, 'range', { min, max });
                              }}
                              placeholder="Max"
                              className={`w-1/2 px-3 py-1.5 rounded-md border text-sm ${
                                theme === 'dark' 
                                  ? 'bg-gray-600 text-white border-gray-500 placeholder-gray-400' 
                                  : 'bg-white text-gray-900 border-gray-300 placeholder-gray-500'
                              } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                            Contains
                          </label>
                          <div className="flex flex-wrap gap-1 mb-2">
                            {Array.isArray((filters[column] as any)?.contains) && ((filters[column] as any).contains as string[]).map((p: string) => (
                              <span key={p} className="flex items-center bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded">
                                {p}
                                <button
                                  className="ml-1 hover:text-red-500"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removePattern(column, 'contains', p);
                                  }}
                                >
                                  <X size={12} />
                                </button>
                              </span>
                            ))}
                          </div>
                          <input
                            type="text"
                            value={containsInputs[column] ?? ''}
                            onChange={(e) => setContainsInputs(prev => ({ ...prev, [column]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addPattern(column, 'contains', containsInputs[column] ?? '');
                                setContainsInputs(prev => ({ ...prev, [column]: '' }));
                              }
                            }}
                            placeholder="Type and press Enter..."
                            className={`w-full px-3 py-1.5 rounded-md border text-sm ${
                              theme === 'dark' 
                                ? 'bg-gray-600 text-white border-gray-500 placeholder-gray-400' 
                                : 'bg-white text-gray-900 border-gray-300 placeholder-gray-500'
                            } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                          />
                        </div>

                        <div>
                          <label className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                            Exclude
                          </label>
                          <div className="flex flex-wrap gap-1 mb-2">
                            {Array.isArray((filters[column] as any)?.exclude) && ((filters[column] as any).exclude as string[]).map((p: string) => (
                              <span key={p} className="flex items-center bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded">
                                {p}
                                <button
                                  className="ml-1 hover:text-red-500"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removePattern(column, 'exclude', p);
                                  }}
                                >
                                  <X size={12} />
                                </button>
                              </span>
                            ))}
                          </div>
                          <input
                            type="text"
                            value={excludeInputs[column] ?? ''}
                            onChange={(e) => setExcludeInputs(prev => ({ ...prev, [column]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addPattern(column, 'exclude', excludeInputs[column] ?? '');
                                setExcludeInputs(prev => ({ ...prev, [column]: '' }));
                              }
                            }}
                            placeholder="Type and press Enter..."
                            className={`w-full px-3 py-1.5 rounded-md border text-sm ${
                              theme === 'dark' 
                                ? 'bg-gray-600 text-white border-gray-500 placeholder-gray-400' 
                                : 'bg-white text-gray-900 border-gray-300 placeholder-gray-500'
                            } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};