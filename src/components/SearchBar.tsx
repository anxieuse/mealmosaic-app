import React, { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface SearchBarProps {
  onSearch: (query: string) => void;
  value: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({ onSearch, value }) => {
  const { theme } = useTheme();
  const [inputValue, setInputValue] = useState(value);
  
  // Update local state when prop changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);
  
  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      onSearch(inputValue);
    }, 300);
    
    return () => {
      clearTimeout(handler);
    };
  }, [inputValue, onSearch]);
  
  const handleClear = () => {
    setInputValue('');
    onSearch('');
  };
  
  return (
    <div className={`flex items-center relative max-w-md w-full ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'} border rounded-md overflow-hidden`}>
      <div className="pl-3">
        <Search className={`h-4 w-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`} />
      </div>
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder="Search in all columns..."
        className={`block w-full pl-2 pr-8 py-1.5 text-sm border-none focus:ring-0 focus:outline-none ${theme === 'dark' ? 'bg-gray-800 text-white placeholder-gray-500' : 'bg-white text-gray-900 placeholder-gray-400'}`}
      />
      {inputValue && (
        <button
          onClick={handleClear}
          className="absolute right-2 p-1"
          aria-label="Clear search"
        >
          <X className={`h-4 w-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`} />
        </button>
      )}
    </div>
  );
};