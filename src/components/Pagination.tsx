import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  rowsPerPage: number;
  onRowsPerPageChange: (rows: number) => void;
  totalRows: number;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  rowsPerPage,
  onRowsPerPageChange,
  totalRows
}) => {
  const { theme } = useTheme();
  
  const handlePrevious = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  };

  const rowsPerPageOptions = [5, 10, 25, 50, 100];

  return (
    <div className={`px-4 py-3 flex items-center justify-between border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} sm:px-6`}>
      <div className="hidden sm:flex sm:items-center">
        <div className="flex items-center">
          <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-700'}`}>
            Showing
            <span className="px-1 font-medium">
              {totalRows === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1}
            </span>
            to
            <span className="px-1 font-medium">
              {Math.min(currentPage * rowsPerPage, totalRows)}
            </span>
            of
            <span className="px-1 font-medium">{totalRows}</span>
            results
          </p>
        </div>
        <div className="ml-4">
          <select
            value={rowsPerPage}
            onChange={(e) => onRowsPerPageChange(Number(e.target.value))}
            className={`block w-full rounded-md border-0 py-1.5 pl-3 pr-10 text-sm ${
              theme === 'dark' 
                ? 'bg-gray-700 text-gray-300 focus:ring-blue-500' 
                : 'bg-white text-gray-900 focus:ring-blue-600'
            } focus:ring-2 outline-none`}
          >
            {rowsPerPageOptions.map(option => (
              <option key={option} value={option}>
                {option} per page
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center justify-between sm:justify-end">
        <div className="sm:hidden">
          <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-700'}`}>
            Page {currentPage} of {totalPages}
          </p>
        </div>
        <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
          <button
            onClick={handlePrevious}
            disabled={currentPage === 1}
            className={`relative inline-flex items-center rounded-l-md px-2 py-2 text-sm ${
              currentPage === 1
                ? `${theme === 'dark' ? 'bg-gray-700 text-gray-500' : 'bg-gray-100 text-gray-400'}`
                : `${theme === 'dark' ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-white text-gray-500 hover:bg-gray-50'}`
            } focus:outline-none focus:ring-2 focus:ring-blue-500`}
          >
            <span className="sr-only">Previous</span>
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
            theme === 'dark' ? 'bg-gray-700 text-gray-300' : 'bg-white text-gray-900'
          }`}>
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={handleNext}
            disabled={currentPage === totalPages || totalPages === 0}
            className={`relative inline-flex items-center rounded-r-md px-2 py-2 text-sm ${
              currentPage === totalPages || totalPages === 0
                ? `${theme === 'dark' ? 'bg-gray-700 text-gray-500' : 'bg-gray-100 text-gray-400'}`
                : `${theme === 'dark' ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-white text-gray-500 hover:bg-gray-50'}`
            } focus:outline-none focus:ring-2 focus:ring-blue-500`}
          >
            <span className="sr-only">Next</span>
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </nav>
      </div>
    </div>
  );
};