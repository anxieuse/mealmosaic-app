import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical, FileSpreadsheet, Edit, Trash2, RefreshCw } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { useToast } from '../hooks/useToast';
import { EditRowModal } from './EditRowModal';
import { DeleteRowModal } from './DeleteRowModal';
import { GLOBAL_SEARCH_KEY } from '../config/global';

interface RowActionsMenuProps {
  rowData: any;
  rowIndex: number;
  headers: string[];
  selectedFile: string | null;
  selectedShop?: string | null;
  onDataChange: () => void; // Callback to refresh data after edit/delete
}

export const RowActionsMenu: React.FC<RowActionsMenuProps> = ({ 
  rowData, 
  rowIndex, 
  headers, 
  selectedFile,
  selectedShop,
  onDataChange 
}) => {
  const { theme } = useTheme();
  const { addToast, updateToast } = useToast();
  const { googleSheetsUrl, tabName } = useGoogleSheets();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<'left' | 'right'>('right');
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isMenuOpen && buttonRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      
      // Check if there's enough space on the right side for the menu (approximately 200px width)
      if (buttonRect.right + 200 > viewportWidth) {
        setMenuPosition('left');
      } else {
        setMenuPosition('right');
      }
    }
  }, [isMenuOpen]);

  const handleAppendToSheets = async () => {
    setIsMenuOpen(false);
    
    if (!googleSheetsUrl) {
      addToast({
        type: 'error',
        title: 'Google Sheets URL not set',
        message: 'Please configure your Google Sheets URL first'
      });
      return;
    }

    // Show loading toast
    const toastId = addToast({
      type: 'loading',
      title: 'Appending to Google Sheets...',
      message: 'Please wait while we add the row'
    });

    try {
      // Prepare row data - include all columns
      const rowValues = headers.map(header => rowData[header] || '');
      
      const response = await fetch('http://localhost:3001/api/google-sheets/append', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rowData: rowValues,
          webAppHeaders: headers,
          tabName: tabName || 'Продукты'
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Update toast to success
        updateToast(toastId, {
          type: 'success',
          title: 'Successfully appended to Google Sheets!',
          message: `Row added to "${result.tabName || tabName}" tab`
        });
      } else {
        // Update toast to error
        updateToast(toastId, {
          type: 'error',
          title: 'Failed to append to Google Sheets',
          message: result.error || 'Unknown error occurred'
        });
      }
    } catch (error) {
      console.error('Error appending to Google Sheets:', error);
      
      // Update toast to error
      updateToast(toastId, {
        type: 'error',
        title: 'Failed to append to Google Sheets',
        message: error instanceof Error ? error.message : 'Network or server error'
      });
    }
  };

  const handleEdit = () => {
    setIsMenuOpen(false);
    setIsEditModalOpen(true);
  };

  const handleDelete = () => {
    setIsMenuOpen(false);
    setIsDeleteModalOpen(true);
  };

  const handleRefreshRow = async () => {
    setIsMenuOpen(false);
    // Determine file for this row – fallback to megacategory when in global search mode
    const effectiveFile = selectedFile && selectedFile !== GLOBAL_SEARCH_KEY
      ? selectedFile
      : (rowData.megacategory ? `${rowData.megacategory}.csv` : null);

    if (!effectiveFile || !selectedShop) {
      addToast({ type: 'error', title: 'Cannot refresh', message: 'No shop/file selected' });
      return;
    }

    const toastId = addToast({ type: 'loading', title: 'Refreshing availability...' });

    try {
      const response = await fetch('/api/update-availability-row', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop: selectedShop, file: effectiveFile, url: rowData.url || rowData['﻿url'] })
      });
      const result = await response.json();

      if (response.ok && result.success) {
        updateToast(toastId, { type: 'success', title: 'Availability updated' });
        onDataChange();
      } else {
        throw new Error(result.error || 'Failed');
      }
    } catch (err) {
      console.error(err);
      updateToast(toastId, { type: 'error', title: 'Failed to refresh', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleEditSave = async (updatedData: any) => {
    const effectiveFile = selectedFile && selectedFile !== GLOBAL_SEARCH_KEY
      ? selectedFile
      : (rowData.megacategory ? `${rowData.megacategory}.csv` : null);

    if (!effectiveFile) {
      throw new Error('No file selected');
    }

    try {
      // Build query parameters – use by-url method
      const params = new URLSearchParams({ 
        file: effectiveFile, 
        url: (updatedData.url ?? updatedData['﻿url'] ?? rowData.url ?? rowData['﻿url']) as string
      });
      if (selectedShop) params.append('shop', selectedShop);

      const response = await fetch(`http://localhost:3001/api/csv-data/row/by-url?${params.toString()}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rowData: updatedData }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update row');
      }

      // Refresh data after successful edit
      onDataChange();

      return { success: true, message: result.message };
    } catch (error) {
      console.error('Error updating row:', error);
      return { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to update row' 
      };
    }
  };

  const handleDeleteConfirm = async () => {
    const effectiveFile = selectedFile && selectedFile !== GLOBAL_SEARCH_KEY
      ? selectedFile
      : (rowData.megacategory ? `${rowData.megacategory}.csv` : null);

    if (!effectiveFile) {
      throw new Error('No file selected');
    }

    try {
      // Build query parameters – use by-url method
      const params = new URLSearchParams({ 
        file: effectiveFile, 
        url: (rowData.url ?? rowData['﻿url']) as string
      });
      if (selectedShop) params.append('shop', selectedShop);

      const response = await fetch(`http://localhost:3001/api/csv-data/row/by-url?${params.toString()}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete row');
      }

      // Refresh data after successful delete
      onDataChange();

      return { success: true, message: result.message };
    } catch (error) {
      console.error('Error deleting row:', error);
      return { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to delete row' 
      };
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className={`p-1 rounded hover:bg-opacity-10 transition-colors ${
          theme === 'dark' ? 'hover:bg-white' : 'hover:bg-black'
        }`}
        title="Row actions"
      >
        <MoreVertical size={16} className={theme === 'dark' ? 'text-gray-300' : 'text-gray-600'} />
      </button>

      {isMenuOpen && (
        <>
          {/* Backdrop to close menu */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsMenuOpen(false)}
          />
          
          {/* Menu */}
          <div 
            ref={menuRef}
            className={`absolute ${menuPosition === 'left' ? 'right-0' : 'left-0'} top-8 z-20 w-48 rounded-md shadow-lg border ${
              theme === 'dark'
                ? 'bg-gray-800 border-gray-700'
                : 'bg-white border-gray-200'
            }`}
          >
            <div className="py-1">
              <button
                onClick={handleAppendToSheets}
                className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left transition-colors ${
                  theme === 'dark'
                    ? 'text-gray-300 hover:bg-gray-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <FileSpreadsheet size={16} />
                Append to Google Sheet
              </button>
              
              <button
                onClick={handleRefreshRow}
                className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left transition-colors ${
                  theme === 'dark'
                    ? 'text-gray-300 hover:bg-gray-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <RefreshCw size={16} />
                Refresh availability
              </button>
              
              <button
                onClick={handleEdit}
                className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left transition-colors ${
                  theme === 'dark'
                    ? 'text-gray-300 hover:bg-gray-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Edit size={16} />
                Edit row
              </button>
              
              <button
                onClick={handleDelete}
                className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left transition-colors ${
                  theme === 'dark'
                    ? 'text-red-400 hover:bg-gray-700'
                    : 'text-red-600 hover:bg-red-50'
                }`}
              >
                <Trash2 size={16} />
                Delete row
              </button>
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      {isEditModalOpen && (
        <EditRowModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          rowData={rowData}
          headers={headers}
          onSave={handleEditSave}
        />
      )}

      {isDeleteModalOpen && (
        <DeleteRowModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          rowData={rowData}
          headers={headers}
          rowIndex={rowIndex}
          onDelete={handleDeleteConfirm}
        />
      )}
    </div>
  );
}; 