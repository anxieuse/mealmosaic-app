import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { GLOBAL_SEARCH_KEY } from '../config/global';

interface FileSelectorProps {
  files: string[];
  selectedFile: string | null;
  onSelectFile: (file: string) => void;
  loading: boolean;
}

export const FileSelector: React.FC<FileSelectorProps> = ({ 
  files, 
  selectedFile, 
  onSelectFile,
  loading
}) => {
  const { theme } = useTheme();
  
  if (loading) {
    return (
      <div className={`w-full h-12 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow flex items-center justify-center`}>
        <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }
  
  return (
    <div className={`w-full ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow`}>
      <div className="flex flex-col p-2 gap-y-2">
        {/* Global search row */}
        <div className="w-full flex justify-center">
          <button
            key="__global_search_btn__"
            onClick={() => onSelectFile(GLOBAL_SEARCH_KEY)}
            className={`px-4 py-2 rounded-md transition-colors whitespace-nowrap font-bold ${
              selectedFile === GLOBAL_SEARCH_KEY
                ? 'bg-blue-500 text-white'
                : `${theme === 'dark' ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`
            }`}
          >
            Global search
          </button>
        </div>

        {/* Megacategory buttons */}
        <div className="flex flex-wrap justify-evenly gap-y-2">
          {files.length === 0 ? (
            <div className={`px-4 py-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              No CSV files found
            </div>
          ) : (
            files.map((file) => (
              <button
                key={file}
                onClick={() => onSelectFile(file)}
                className={`px-4 py-2 rounded-md transition-colors whitespace-nowrap ${
                  selectedFile === file
                    ? 'bg-blue-500 text-white'
                    : `${theme === 'dark' 
                        ? 'text-gray-300 hover:bg-gray-700' 
                        : 'text-gray-700 hover:bg-gray-100'}`
                }`}
              >
                {file.replace(/\.csv$/i, '')}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};