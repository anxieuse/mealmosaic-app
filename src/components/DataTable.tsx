import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, ArrowDown, Loader2, ExternalLink } from 'lucide-react';
import { Pagination } from './Pagination';
import { useTheme } from '../context/ThemeContext';
import { RowActionsMenu } from './RowActionsMenu';
import { ALWAYS_HIDDEN_COLUMNS } from '../config/columnConfig';

// Function to normalize column names (remove BOM and other invisible characters)
const normalizeColumnName = (columnName: string): string => {
  return columnName.replace(/^\uFEFF/, '').trim();
};

interface DataTableProps {
  data: any[];
  visibleColumns: string[];
  columnOrder: string[];
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  onSort: (column: string) => void;
  currentPage: number;
  totalPages: number;
  rowsPerPage: number;
  onPageChange: (page: number) => void;
  onRowsPerPageChange: (rows: number) => void;
  totalRows: number;
  loading: boolean;
  selectedFile: string | null;
  selectedShop?: string | null;
  onDataChange: () => void;
}

const MAX_TEXT_LENGTH = 213;

const TruncatedText: React.FC<{ text: string }> = ({ text }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (text.length <= MAX_TEXT_LENGTH) {
    return <span>{text}</span>;
  }
  
  return (
    <div>
      {isExpanded ? (
        <>
          <span>{text}</span>
          <button
            onClick={() => setIsExpanded(false)}
            className="ml-2 text-blue-500 hover:text-blue-600 text-sm font-medium"
          >
            Show less
          </button>
        </>
      ) : (
        <>
          <span>{text.slice(0, MAX_TEXT_LENGTH)}...</span>
          <button
            onClick={() => setIsExpanded(true)}
            className="ml-2 text-blue-500 hover:text-blue-600 text-sm font-medium"
          >
            Show more
          </button>
        </>
      )}
    </div>
  );
};

// utility to get px string
const px = (n?: number) => (n ? `${n}px` : undefined);

export const DataTable: React.FC<DataTableProps> = ({
  data,
  visibleColumns,
  columnOrder,
  sortConfig,
  onSort,
  currentPage,
  totalPages,
  rowsPerPage,
  onPageChange,
  onRowsPerPageChange,
  totalRows,
  loading,
  selectedFile,
  selectedShop,
  onDataChange
}) => {
  const { theme } = useTheme();
  
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  // Adjust widths when columns change (keep previous where possible)
  useEffect(() => {
    setColumnWidths(prev => {
      const next: Record<string, number> = { ...prev };
      // prune removed columns
      Object.keys(next).forEach(c => {
        if (!columnOrder.includes(c)) delete next[c];
      });
      return next;
    });
  }, [columnOrder]);

  const resizingColRef = useRef<string | null>(null);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  const onMouseMove = (e: MouseEvent) => {
    const col = resizingColRef.current;
    if (!col) return;
    const delta = e.clientX - startXRef.current;
    setColumnWidths(prev => ({ ...prev, [col]: Math.max(50, startWidthRef.current + delta) }));
  };

  const stopResize = () => {
    resizingColRef.current = null;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', stopResize);
  };

  const startResize = (col: string, event: React.MouseEvent) => {
    event.preventDefault();
    resizingColRef.current = col;
    startXRef.current = event.clientX;
    startWidthRef.current = columnWidths[col] || (event.currentTarget.parentElement?.getBoundingClientRect().width || 150);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', stopResize);
  };

  const orderedVisibleColumns = [...visibleColumns].sort(
    (a, b) => columnOrder.indexOf(a) - columnOrder.indexOf(b)
  );
  
  const formatCellValue = (column: string, value: any, row: any) => {
    if (value === null || value === undefined) return '—';
    if (value === true) return 'Yes';
    if (value === false) return 'No';
    
    // Special handling for name column with URL
    if (column === 'name') {
      // Try to find URL column (handle BOM characters)
      const urlValue = row.url || row['﻿url'] || null;
      if (urlValue) {
        return (
          <a 
            href={urlValue} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-blue-500 hover:text-blue-600"
          >
            {value}
          </a>
        );
      }
    }
    
    // Image preview for imgUrl column
    if (normalizeColumnName(column).toLowerCase() === 'imgurl' && typeof value === 'string') {
      return (
        <a href={value} target="_blank" rel="noopener noreferrer" className="inline-block">
          <img
            src={value}
            alt="img"
            className="w-24 h-24 object-contain rounded-md border border-gray-200"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </a>
      );
    }
    
    // Handle long text
    if (typeof value === 'string' && value.length > MAX_TEXT_LENGTH) {
      return <TruncatedText text={value} />;
    }
    
    // Check if it's a number
    if (!isNaN(parseFloat(value)) && !isNaN(Number(value))) {
      // Check if it's a decimal with more than 2 decimal places
      if (value.toString().includes('.') && value.toString().split('.')[1].length > 2) {
        return parseFloat(value).toFixed(2);
      }
    }
    
    return value;
  };

  if (loading) {
    return (
      <div className={`rounded-lg shadow overflow-hidden ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="animate-spin text-blue-500" size={48} />
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={`rounded-lg shadow overflow-hidden ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="flex flex-col items-center justify-center h-64">
          <p className={`text-lg ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}`}>
            No data found
          </p>
          <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            Try adjusting your filters or select a different file
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg shadow overflow-hidden ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200" style={{ tableLayout: 'fixed' }}>
          <thead className={`${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'}`}>
            <tr>
              {/* Actions column header */}
              <th
                scope="col"
                className={`px-2 py-3 text-left text-xs font-medium relative ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer select-none`}
              >
                Actions
              </th>
              {orderedVisibleColumns.map((column) => {
                const normalizedColumn = normalizeColumnName(column);
                return (
                  !ALWAYS_HIDDEN_COLUMNS.includes(normalizedColumn) && (
                    <th
                      key={column}
                      scope="col"
                      className={`px-2 py-3 text-left text-xs font-medium relative ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer select-none`}
                      onClick={() => onSort(column)}
                      style={{ width: px(columnWidths[column]) }}
                    >
                      <div className="flex items-center space-x-1">
                        <span className="truncate max-w-xs">{column}</span>
                        {sortConfig?.key === column && (
                          sortConfig.direction === 'asc' 
                            ? <ArrowUp size={14} className="flex-shrink-0" />
                            : <ArrowDown size={14} className="flex-shrink-0" />
                        )}
                      </div>
                      {/* Resizer handle */}
                      <div
                        onMouseDown={(e) => startResize(column, e)}
                        className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-30"
                      />
                    </th>
                  )
                );
              })}
            </tr>
          </thead>
          <tbody className={`divide-y ${theme === 'dark' ? 'divide-gray-700' : 'divide-gray-200'}`}>
            {data.map((row, rowIndex) => (
              <tr 
                key={rowIndex}
                className={`${theme === 'dark' 
                  ? 'hover:bg-gray-700' 
                  : 'hover:bg-gray-50'} transition-colors`}
              >
                {/* Actions column */}
                <td className={`px-6 py-4 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-800'} w-16`}>
                  <RowActionsMenu 
                    rowData={row}
                    rowIndex={rowIndex}
                    headers={Object.keys(row)}
                    selectedFile={selectedFile}
                    selectedShop={selectedShop}
                    onDataChange={onDataChange}
                  />
                </td>
                {orderedVisibleColumns.map((column) => {
                  const normalizedColumn = normalizeColumnName(column);
                  return (
                    !ALWAYS_HIDDEN_COLUMNS.includes(normalizedColumn) && (
                      <td 
                        key={`${rowIndex}-${column}`}
                        className={`px-2 py-4 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-800'}`}
                        style={{ maxWidth: '400px', wordBreak: 'break-word', width: px(columnWidths[column]) }}
                      >
                        {formatCellValue(column, row[column], row)}
                      </td>
                    )
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <Pagination 
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={onPageChange}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={onRowsPerPageChange}
        totalRows={totalRows}
      />
    </div>
  );
};