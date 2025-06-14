import React, { useState, useEffect } from 'react';
import { Sliders, Columns, ListTree, ArrowUp, ArrowDown, History, X, Trash2, RefreshCw, XCircle } from 'lucide-react';
import { ALWAYS_HIDDEN_COLUMNS, HIDDEN_BY_DEFAULT_COLUMNS, SHOWN_BY_DEFAULT_COLUMNS } from '../config/columnConfig';
import { GLOBAL_SEARCH_KEY } from '../config/global';
import { FileSelector } from './FileSelector';
import { ShopSelector } from './ShopSelector';
import { DataTable } from './DataTable';
import { ColumnManager } from './ColumnManager';
import { FilterPanel } from './FilterPanel';
import { SearchBar } from './SearchBar';
import { useCSVContext } from '../context/CSVContext';
import { useTheme } from '../context/ThemeContext';
import { GoogleSheetsSettings } from './GoogleSheetsSettings';
import { CategoryManager } from './CategoryManager';
import type { CategoryNode } from './CategoryManager';
import { useToast } from '../hooks/useToast';

// Numeric columns for type-specific filtering
const NUMERIC_COLUMNS = [
  'pri/we',
  'pro/cal',
  'weight',
  'price',
  'calories',
  'proteins',
  'fats',
  'carbohydrates',
  'average_rating',
  'rating_count'
];

const normalizeString = (str: unknown): string => {
  if (str === null || str === undefined) {
    return '';
  }
  return String(str).replace(/\u00A0/g, ' ').toLowerCase();
};

// Function to normalize header names (remove BOM and other invisible characters)
const normalizeHeader = (header: string): string => {
  return header.replace(/^\uFEFF/, '').trim(); // Remove BOM character
};

export const CSVViewer: React.FC = () => {
  const { theme } = useTheme();
  const { 
    shops,
    files,
    selectedShop,
    selectedFile,
    setSelectedShop,
    setSelectedFile,
    data,
    headers,
    loading,
    error,
    refreshData,
    refreshAll
  } = useCSVContext();

  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [isColumnManagerOpen, setIsColumnManagerOpen] = useState(false);
  const [columnTypes, setColumnTypes] = useState<Record<string, 'string' | 'number'>>({});
  const [hideUnknownMacros, setHideUnknownMacros] = useState(true);

  // Custom formula sorting
  const [formulaInput, setFormulaInput] = useState('');
  const [appliedFormula, setAppliedFormula] = useState('');
  const [formulaSortDir, setFormulaSortDir] = useState<'asc' | 'desc' | null>(null);

  // history
  const [formulaHistory, setFormulaHistory] = useState<string[]>(() => {
    const stored = localStorage.getItem('formulaHistory');
    return stored ? JSON.parse(stored) : [];
  });
  const [showFormulaHistory, setShowFormulaHistory] = useState(false);

  const { addToast } = useToast();

  // Category management
  const [categoriesTree, setCategoriesTree] = useState<CategoryNode[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set<string>());
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);

  const CATEGORY_COLUMN = 'category';

  // Availability refresh state
  const [isRefreshingAvailability, setIsRefreshingAvailability] = useState(false);
  const [refreshProcessed, setRefreshProcessed] = useState(0);
  const [refreshTotal, setRefreshTotal] = useState(0);

  const esRef = React.useRef<EventSource | XMLHttpRequest | null>(null);

  const prevSelectedFileRef = React.useRef<string | null>(null);

  const handleRefreshAvailability = () => {
    if (!selectedShop || !selectedFile || selectedFile === GLOBAL_SEARCH_KEY || isRefreshingAvailability || data.length === 0) return;

    setIsRefreshingAvailability(true);
    setRefreshProcessed(0);
    setRefreshTotal(processedData.length);

    // Get URLs of filtered rows
    const urlsToUpdate = processedData.map(row => row.url || row['﻿url']);

    // Create a POST request with EventSource
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/update-availability', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'text/event-stream');

    let buffer = '';
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4) {
        if (xhr.status !== 200) {
          setIsRefreshingAvailability(false);
          addToast({ type: 'error', title: 'Failed to refresh availability' });
          return;
        }
      }
    };

    xhr.onprogress = () => {
      const newData = xhr.responseText.slice(buffer.length);
      buffer = xhr.responseText;

      const lines = newData.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const msg = JSON.parse(line.slice(6));
            if (msg.type === 'start') {
              if (typeof msg.total === 'number') setRefreshTotal(msg.total);
            } else if (msg.type === 'progress') {
              setRefreshProcessed(msg.processed);
            } else if (msg.type === 'done') {
              setIsRefreshingAvailability(false);
              addToast({ type: 'success', title: 'Availability updated' });
              refreshData();
            } else if (msg.type === 'error') {
              setIsRefreshingAvailability(false);
              addToast({ type: 'error', title: msg.message || 'Failed to refresh availability' });
            }
          } catch (err) {
            console.error('Error parsing SSE message:', err);
          }
        }
      }
    };

    xhr.onerror = () => {
      setIsRefreshingAvailability(false);
      addToast({ type: 'error', title: 'Failed to refresh availability' });
    };

    xhr.send(JSON.stringify({
      shop: selectedShop,
      file: selectedFile,
      urls: urlsToUpdate
    }));

    // Store the XHR object for cancellation
    esRef.current = xhr;
  };

  const handleCancelRefresh = () => {
    if (esRef.current) {
      if (esRef.current instanceof XMLHttpRequest) {
        // Abort the XHR request
        esRef.current.abort();
        
        // Send a cancellation request to the server
        fetch('/api/update-availability/cancel', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            shop: selectedShop,
            file: selectedFile
          })
        }).catch(err => {
          console.error('Error sending cancellation request:', err);
        });
      } else {
        esRef.current.close();
      }
      esRef.current = null;
    }
    setIsRefreshingAvailability(false);
    addToast({ type: 'success', title: 'Refresh cancelled' });
  };

  // Update visible columns when headers change
  const prevHeadersRef = React.useRef<string[]>([]);
  useEffect(() => {
    if (headers.length === 0) return;

    // Only run if header structure has genuinely changed
    if (prevHeadersRef.current.join('|') === headers.join('|')) return;

    const shown = SHOWN_BY_DEFAULT_COLUMNS.filter(col => headers.includes(col));
    const hiddenToggle = HIDDEN_BY_DEFAULT_COLUMNS.filter(col => headers.includes(col));
    const remainder = headers.filter(h => !shown.includes(h) && !hiddenToggle.includes(h));

    setVisibleColumns(shown);
    setColumnOrder([...shown, ...hiddenToggle, ...remainder]);
    
    // Set column types using normalized headers
    const types: Record<string, 'string' | 'number'> = {};
    headers.forEach((header, index) => {
      const normalizedHeader = normalizeHeader(header);
      types[header] = NUMERIC_COLUMNS.includes(normalizedHeader) ? 'number' : 'string';
    });
    setColumnTypes(types);

    prevHeadersRef.current = headers;
  }, [headers]);

  // Build categories tree whenever data changes
  useEffect(() => {
    if (!data.length || !headers.length) return;

    const buildTree = (): { tree: CategoryNode[]; allPaths: string[] } => {
      const root: Record<string, any> = {};
      const allPaths: string[] = [];

      data.forEach(row => {
        const rawValue = row[CATEGORY_COLUMN] ?? '';
        if (!rawValue) return;

        const path = String(rawValue).split('#').map(p => p.trim()).join('#');
        allPaths.push(path);

        let current = root;
        path.split('#').forEach((part, index, arr) => {
          if (!current[part]) {
            current[part] = {
              name: part,
              path: arr.slice(0, index + 1).join('#'),
              children: {}
            };
          }
          current = current[part].children;
        });
      });

      const convert = (obj: Record<string, any>): CategoryNode[] => {
        return Object.values(obj).map((node: any) => ({
          name: node.name,
          path: node.path,
          children: convert(node.children as Record<string, any>)
        }));
      };

      return { tree: convert(root), allPaths };
    };

    const { tree, allPaths } = buildTree();
    setCategoriesTree(tree);

    // If file changed, select all categories by default
    if (selectedFile !== prevSelectedFileRef.current) {
      prevSelectedFileRef.current = selectedFile;
      setSelectedCategories(new Set(allPaths));
      return; // done
    }

    // Otherwise only update selected categories if necessary
    setSelectedCategories(prev => {
      // If no categories are selected, select all
      if (prev.size === 0) {
        return new Set(allPaths);
      }

      // If the tree structure changed (new paths added/removed), update selection
      const prevPaths = Array.from(prev);
      const hasNewPaths = allPaths.some(path => !prevPaths.includes(path));
      const hasRemovedPaths = prevPaths.some(path => !allPaths.includes(path));

      if (hasNewPaths || hasRemovedPaths) {
        // Keep existing selections that are still valid
        const validSelections = prevPaths.filter(path => allPaths.includes(path));
        // If we lost all selections, select all
        return validSelections.length > 0 ? new Set(validSelections) : new Set(allPaths);
      }

      // Otherwise keep existing selection
      return prev;
    });
  }, [data, headers, selectedFile]);

  // Reset function
  const handleReset = () => {
    setSortConfig(null);
    setFormulaSortDir(null);
    setFormulaInput('');
    setAppliedFormula('');
    setFilters({});
    setSearchQuery('');
    setCurrentPage(1);
    setHideUnknownMacros(true);
    if (headers.length > 0) {
      const shown = SHOWN_BY_DEFAULT_COLUMNS.filter(col => headers.includes(col));
      const hiddenToggle = HIDDEN_BY_DEFAULT_COLUMNS.filter(col => headers.includes(col));
      const remainder = headers.filter(h => !shown.includes(h) && !hiddenToggle.includes(h));

      setVisibleColumns(shown);
      setColumnOrder([...shown, ...hiddenToggle, ...remainder]);
    }
    setIsCategoryManagerOpen(false);
    // Reset category selection to all (if tree exists)
    const collectAll = (nodes: CategoryNode[]): string[] => {
      const arr: string[] = [];
      const dfs = (n: CategoryNode[]) => {
        n.forEach(nd => {
          arr.push(nd.path);
          if (nd.children.length) dfs(nd.children);
        });
      };
      dfs(nodes);
      return arr;
    };
    setSelectedCategories(new Set(collectAll(categoriesTree)));
  };

  // Function to evaluate formula per row
  const buildFormulaFn = React.useMemo(() => {
    if (!appliedFormula.trim()) return null;
    // Replace column references e.g. "calories" with parseFloat(row["calories"])
    const expr = appliedFormula.replace(/"([^"]+)"/g, (_, col: string) => {
      // Escape quotes inside column names not expected due to regex
      return `(parseFloat(row[${JSON.stringify(col)}])||0)`;
    });
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('row', `try { return ${expr}; } catch(e) { return NaN; }`);
      return fn as (row: any) => number;
    } catch (e) {
      console.error('Invalid formula:', e);
      return null;
    }
  }, [appliedFormula]);

  // Save history when formula applied successfully
  useEffect(() => {
    if (appliedFormula) {
      addFormulaToHistory(appliedFormula);
    }
  }, [appliedFormula]);

  const validateAndApplyFormula = () => {
    const formula = formulaInput.trim();
    if (!formula) return;

    // Validate column names exist
    const missingCols: string[] = [];
    formula.replace(/"([^"]+)"/g, (_, col: string) => {
      if (!headers.includes(col)) missingCols.push(col);
      return '';
    });
    if (missingCols.length > 0) {
      addToast({ type: 'error', title: 'Unknown column(s)', message: missingCols.join(', ') });
      return;
    }

    // Detect division by constant zero
    const formulaWithoutQuotes = formula.replace(/"[^\"]+"/g, '');
    if (/\/\s*0(?![0-9])/g.test(formulaWithoutQuotes)) {
      addToast({ type: 'error', title: 'Division by zero', message: 'Formula contains division by 0 constant' });
      return;
    }

    // Try compiling function
    const expr = formula.replace(/"([^"]+)"/g, (_, col: string) => `(parseFloat(row[${JSON.stringify(col)}])||0)`);
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('row', `return ${expr};`);
      // quick test on first row if exists
      if (data.length > 0) {
        const testVal = fn(data[0]);
        if (isNaN(testVal)) {
          addToast({ type: 'error', title: 'Formula result is NaN', message: 'Ensure numeric columns used.' });
          return;
        }
      }
      setFormulaInput(formula);
      setAppliedFormula(formula);
      setFormulaSortDir(null);
      setShowFormulaHistory(false);
      addToast({ type: 'success', title: 'Formula applied' });
    } catch (e) {
      addToast({ type: 'error', title: 'Invalid formula syntax' });
    }
  };

  // Filter and sort data
  const processedData = React.useMemo(() => {
    if (!data.length) return [];
    
    let workingData = data;

    // Category filter (if category column exists)
    if (headers.some(h => normalizeHeader(h) === CATEGORY_COLUMN) && selectedCategories.size > 0) {
      workingData = workingData.filter(row => {
        const rawValue = row[CATEGORY_COLUMN] ?? '';
        const path = rawValue ? String(rawValue).split('#').map(p => p.trim()).join('#') : '';
        return selectedCategories.has(path);
      });
    }
    
    // Apply search filter
    let filteredData = workingData;
    if (searchQuery) {
      const query = normalizeString(searchQuery);
      filteredData = workingData.filter(row => 
        visibleColumns.some(column => 
          normalizeString(row[column]).includes(query)
        )
      );
    }
    
    // Apply hide unknown macros filter
    if (hideUnknownMacros) {
      filteredData = filteredData.filter(row => {
        const calories = parseFloat(row.calories);
        return calories !== 100500;
      });
    }
    
    // Apply column filters
    Object.entries(filters).forEach(([column, filter]) => {
      if (!filter) return;
      
      if (columnTypes[column] === 'number') {
        if (filter.type === 'equals') {
          filteredData = filteredData.filter(row => {
            const value = parseFloat(row[column]);
            return value === filter.value;
          });
        } else if (filter.type === 'range') {
          const { min, max } = filter;
          filteredData = filteredData.filter(row => {
            const value = parseFloat(row[column]);
            return (!min || value >= min) && (!max || value <= max);
          });
        }
      } else {
        const containsVal = (filter as any).contains;
        const excludeVal = (filter as any).exclude;

        // Handle "contains" patterns
        if (containsVal) {
          const patterns: string[] = Array.isArray(containsVal)
            ? containsVal
            : [containsVal];

          const normalizedPatterns = patterns.map(normalizeString).filter(Boolean);

          if (normalizedPatterns.length > 0) {
            filteredData = filteredData.filter(row => {
              const cell = normalizeString(row[column]);
              return normalizedPatterns.every(pattern => cell.includes(pattern));
            });
          }
        }

        // Handle "exclude" patterns
        if (excludeVal) {
          let patterns: string[];
          if (Array.isArray(excludeVal)) {
            patterns = excludeVal;
          } else if (typeof excludeVal === 'string') {
            patterns = excludeVal
              .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
              .map(p => p.trim().replace(/^"|"$/g, ''));
          } else {
            patterns = [];
          }

          const normalizedPatterns = patterns.map(normalizeString).filter(Boolean);

          if (normalizedPatterns.length > 0) {
            filteredData = filteredData.filter(row => {
              const cell = normalizeString(row[column]);
              return !normalizedPatterns.some(pattern => cell.includes(pattern));
            });
          }
        }
      }
    });
    
    // Apply sorting
    if (buildFormulaFn && formulaSortDir) {
      filteredData = [...filteredData].sort((a, b) => {
        const aVal = buildFormulaFn(a);
        const bVal = buildFormulaFn(b);
        const aNum = isNaN(aVal) ? -Infinity : aVal;
        const bNum = isNaN(bVal) ? -Infinity : bVal;
        return formulaSortDir === 'asc' ? aNum - bNum : bNum - aNum;
      });
    } else if (sortConfig) {
      filteredData = [...filteredData].sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];
        
        // Check if values are numbers
        const aNum = !isNaN(parseFloat(aValue));
        const bNum = !isNaN(parseFloat(bValue));
        
        if (aNum && bNum) {
          return sortConfig.direction === 'asc' 
            ? parseFloat(aValue) - parseFloat(bValue)
            : parseFloat(bValue) - parseFloat(aValue);
        } else {
          if (sortConfig.direction === 'asc') {
            return String(aValue).localeCompare(String(bValue));
          } else {
            return String(bValue).localeCompare(String(aValue));
          }
        }
      });
    }
    
    return filteredData;
  }, [data, visibleColumns, sortConfig, filters, searchQuery, columnTypes, hideUnknownMacros, selectedCategories, buildFormulaFn, formulaSortDir]);

  // Calculate pagination
  const paginatedData = React.useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return processedData.slice(startIndex, startIndex + rowsPerPage);
  }, [processedData, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(processedData.length / rowsPerPage);

  // Adjust current page if it becomes invalid due to data changes
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(Math.max(1, totalPages));
    }
  }, [totalPages, currentPage]);

  const handleSort = (column: string) => {
    setFormulaSortDir(null);
    setSortConfig(prevSortConfig => {
      if (prevSortConfig?.key === column) {
        if (prevSortConfig.direction === 'asc') {
          return { key: column, direction: 'desc' };
        }
        // If it was descending, remove sort
        return null;
      }
      // New sort - start with ascending
      return { key: column, direction: 'asc' };
    });
  };

  const handleColumnVisibilityChange = (column: string, isVisible: boolean) => {
    setVisibleColumns(prev => 
      isVisible 
        ? [...prev, column].sort((a, b) => columnOrder.indexOf(a) - columnOrder.indexOf(b))
        : prev.filter(col => col !== column)
    );
  };

  const handleColumnOrderChange = (newOrder: string[]) => {
    setColumnOrder(newOrder);
  };

  const handleFilterChange = (column: string, filter: any) => {
    setFilters(prev => {
      if (filter === undefined) {
        const newFilters = { ...prev };
        delete newFilters[column];
        return newFilters;
      }
      return { ...prev, [column]: filter };
    });
    setCurrentPage(1);
  };

  const handleSearchChange = React.useCallback((query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  }, []);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleRowsPerPageChange = (rows: number) => {
    setRowsPerPage(rows);
    setCurrentPage(1);
  };

  const toggleFilterPanel = () => {
    setIsFilterPanelOpen(prev => !prev);
  };

  const applyFormulaSort = (dir: 'asc' | 'desc') => {
    if (!appliedFormula.trim()) return;
    setFormulaSortDir(dir);
    setSortConfig(null); // clear column sort to avoid confusion
  };

  const clearFormulaSort = () => {
    setFormulaSortDir(null);
  };

  const addFormulaToHistory = (f: string) => {
    setFormulaHistory(prev => {
      const updated = [f, ...prev.filter(x => x !== f)].slice(0, 15);
      localStorage.setItem('formulaHistory', JSON.stringify(updated));
      return updated;
    });
  };

  const removeFormulaFromHistory = (f: string) => {
    setFormulaHistory(prev => {
      const updated = prev.filter(x => x !== f);
      localStorage.setItem('formulaHistory', JSON.stringify(updated));
      return updated;
    });
  };

  const clearFormulaHistory = () => {
    setFormulaHistory([]);
    localStorage.removeItem('formulaHistory');
  };

  if (error) {
    return (
      <div className="text-center py-10">
        <p className="text-red-500 mb-2">Error loading CSV files: {error}</p>
        <button 
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Google Sheets Settings */}
      <GoogleSheetsSettings />
      
      {/* Shop Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="flex-1">
          <ShopSelector 
            shops={shops} 
            selectedShop={selectedShop} 
            onSelectShop={setSelectedShop} 
            loading={loading && shops.length === 0}
          />
        </div>
      </div>
      
      {/* File Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="flex-1">
          <FileSelector 
            files={files} 
            selectedFile={selectedFile} 
            onSelectFile={setSelectedFile} 
            loading={loading}
          />
        </div>
      </div>
      
      <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm">
            <span className="font-medium">{processedData.length}</span> results
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Custom formula sort */}
          <div className="flex items-center gap-1 order-2 relative">
            <input
              type="text"
              value={formulaInput}
              onChange={(e) => setFormulaInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  validateAndApplyFormula();
                }
              }}
              placeholder='Formula e.g. "calories"/"price"'
              className={`w-60 px-3 py-1.5 rounded-md border text-sm ${
                theme === 'dark'
                  ? 'bg-gray-700 text-white border-gray-600 placeholder-gray-400'
                  : 'bg-white text-gray-900 border-gray-300 placeholder-gray-500'
              } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
            />
            {formulaHistory.length > 0 && (
              <button
                onClick={() => setShowFormulaHistory(!showFormulaHistory)}
                className={`p-1 rounded ${theme === 'dark' ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
                title="Show formula history"
              >
                <History size={14} />
              </button>
            )}
            <button
              onClick={() => applyFormulaSort('asc')}
              disabled={!appliedFormula.trim()}
              className={`p-1 rounded-md border ${
                formulaSortDir === 'asc' ? 'bg-blue-50 border-blue-200 text-blue-500' : theme === 'dark' ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' : 'bg-white border-gray-300 hover:bg-gray-50'
              } disabled:opacity-50`}
            >
              <ArrowUp size={14} />
            </button>
            <button
              onClick={() => applyFormulaSort('desc')}
              disabled={!appliedFormula.trim()}
              className={`p-1 rounded-md border ${
                formulaSortDir === 'desc' ? 'bg-blue-50 border-blue-200 text-blue-500' : theme === 'dark' ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' : 'bg-white border-gray-300 hover:bg-gray-50'
              } disabled:opacity-50`}
            >
              <ArrowDown size={14} />
            </button>
            {formulaSortDir && (
              <button
                onClick={clearFormulaSort}
                className={`text-xs text-red-500 underline`}
              >
                clear
              </button>
            )}

            {/* History dropdown */}
            {showFormulaHistory && formulaHistory.length > 0 && (
              <div
                className={`absolute left-0 top-full mt-2 p-2 border rounded-md z-20 w-72 ${
                  theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Recent formulas</span>
                  <button
                    onClick={clearFormulaHistory}
                    className={`p-1 rounded ${theme === 'dark' ? 'text-gray-400 hover:bg-gray-600' : 'text-gray-500 hover:bg-gray-100'}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {formulaHistory.map((f, idx) => (
                    <div key={idx} className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setFormulaInput(f);
                          setAppliedFormula(f);
                          setShowFormulaHistory(false);
                          addToast({ type: 'success', title: 'Formula applied' });
                        }}
                        className={`flex-1 text-left text-xs truncate p-1 rounded ${
                          theme === 'dark' ? 'text-gray-300 hover:bg-gray-600' : 'text-gray-700 hover:bg-gray-100'
                        }`}
                        title={f}
                      >
                        {f}
                      </button>
                      <button
                        onClick={() => removeFormulaFromHistory(f)}
                        className={`p-1 rounded ${
                          theme === 'dark' ? 'text-gray-400 hover:bg-gray-600' : 'text-gray-500 hover:bg-gray-100'
                        }`}
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="w-80 ml-2 order-3">
            <SearchBar 
              onSearch={handleSearchChange} 
              value={searchQuery} 
            />
          </div>
          <button
            onClick={async () => {
              await refreshAll();
              handleReset();
            }}
            disabled={isRefreshingAvailability}
            className={`flex items-center gap-1 order-1 px-3 py-1.5 rounded-md border transition-colors ${
              theme === 'dark'
                ? 'bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-300'
                : 'bg-white border-gray-300 hover:bg-gray-50 text-gray-700'
            } disabled:opacity-50`}
          >
            <span className="text-sm">Reload</span>
          </button>
          <button
            onClick={handleRefreshAvailability}
            disabled={isRefreshingAvailability || data.length === 0}
            className={`flex items-center gap-1 order-8 px-3 py-1.5 rounded-md border transition-colors ${
              theme === 'dark'
                ? 'bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-300'
                : 'bg-white border-gray-300 hover:bg-gray-50 text-gray-700'
            } disabled:opacity-50`}
          >
            <RefreshCw size={16} className={isRefreshingAvailability ? 'animate-spin' : ''} />
            <span className="text-sm">Refresh</span>
          </button>
          {isRefreshingAvailability && (
            <div className="flex items-center gap-2 w-56 order-9">
              <div className="flex-1 h-2 bg-gray-200 rounded overflow-hidden">
                <div
                  className="h-full bg-blue-500"
                  style={{ width: `${(refreshProcessed / refreshTotal) * 100}%` }}
                ></div>
              </div>
              <span className="text-xs whitespace-nowrap">{refreshProcessed}/{refreshTotal}</span>
              <button onClick={handleCancelRefresh} title="Cancel" className="p-1">
                <XCircle size={14} className="text-red-500" />
              </button>
            </div>
          )}
          <button
            onClick={toggleFilterPanel}
            className={`flex items-center gap-1 order-6 px-3 py-1.5 rounded-md border transition-colors ${
              isFilterPanelOpen
                ? `${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-blue-50 border-blue-200'} text-blue-500`
                : `${theme === 'dark' ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' : 'bg-white border-gray-300 hover:bg-gray-50'}`
            }`}
          >
            <Sliders size={16} />
            <span className="text-sm">Filters</span>
          </button>
          
          <div className="relative order-5">
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
                  columns={headers}
                  visibleColumns={visibleColumns}
                  onColumnVisibilityChange={handleColumnVisibilityChange}
                  columnOrder={columnOrder}
                  onColumnOrderChange={handleColumnOrderChange}
                  onClose={() => setIsColumnManagerOpen(false)}
                />
              </div>
            )}
          </div>

          {/* Category selection */}
          {categoriesTree.length > 0 && (
            <div className="relative order-4">
              <button
                onClick={() => setIsCategoryManagerOpen(!isCategoryManagerOpen)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md border transition-colors ${
                  isCategoryManagerOpen
                    ? `${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-blue-50 border-blue-200'} text-blue-500`
                    : `${theme === 'dark' ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' : 'bg-white border-gray-300 hover:bg-gray-50'}`
                }`}
              >
                <ListTree size={16} />
                <span className="text-sm">Categories</span>
              </button>
              {isCategoryManagerOpen && (
                <div className="absolute right-0 top-full mt-2 z-10 w-80">
                  <CategoryManager
                    tree={categoriesTree}
                    selected={selectedCategories}
                    onSelectionChange={(set) => setSelectedCategories(new Set(set))}
                    onClose={() => setIsCategoryManagerOpen(false)}
                  />
                </div>
              )}
            </div>
          )}

          {/* Delimiter after Filters */}
          <div className="mx-2 h-6 border-l border-gray-300 dark:border-gray-600 order-7" />
        </div>
      </div>
      
      <div className="flex flex-col lg:flex-row gap-6">
        {isFilterPanelOpen && (
          <FilterPanel 
            columns={headers} 
            onFilterChange={handleFilterChange}
            filters={filters}
            className={`lg:w-72 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} p-4 rounded-lg shadow`}
            columnTypes={columnTypes}
            hideUnknownMacros={hideUnknownMacros}
            onHideUnknownMacrosChange={setHideUnknownMacros}
          />
        )}
        
        <div className={`${isFilterPanelOpen ? 'lg:flex-1' : 'w-full'}`}>
          <DataTable 
            data={paginatedData}
            visibleColumns={visibleColumns}
            columnOrder={columnOrder}
            sortConfig={sortConfig}
            onSort={handleSort}
            currentPage={currentPage}
            totalPages={totalPages}
            rowsPerPage={rowsPerPage}
            onPageChange={handlePageChange}
            onRowsPerPageChange={handleRowsPerPageChange}
            totalRows={processedData.length}
            loading={loading && !data.length}
            selectedFile={selectedFile}
            selectedShop={selectedShop}
            onDataChange={refreshData}
          />
        </div>
      </div>
    </div>
  );
};