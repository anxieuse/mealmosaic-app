import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical, Check, X, CheckSquare, Square } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { ALWAYS_HIDDEN_COLUMNS } from '../config/columnConfig';

// Function to normalize column names (remove BOM and other invisible characters)
const normalizeColumnName = (columnName: string): string => {
  return columnName.replace(/^\uFEFF/, '').trim();
};

interface ColumnManagerProps {
  columns: string[];
  visibleColumns: string[];
  onColumnVisibilityChange: (column: string, isVisible: boolean) => void;
  columnOrder: string[];
  onColumnOrderChange: (newOrder: string[]) => void;
  onClose: () => void;
}

export const ColumnManager: React.FC<ColumnManagerProps> = ({
  columns,
  visibleColumns,
  onColumnVisibilityChange,
  columnOrder,
  onColumnOrderChange,
  onClose
}) => {
  const { theme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [orderedColumns, setOrderedColumns] = useState(columnOrder);
  
  useEffect(() => {
    setOrderedColumns(columnOrder);
  }, [columnOrder]);
  
  const handleDragEnd = (result: any) => {
    if (!result.destination) return;
    
    const items = Array.from(orderedColumns);

    const sourceColumn = filteredColumns[result.source.index];
    
    const sourceIndex = items.indexOf(sourceColumn);

    const destinationColumn = filteredColumns[result.destination.index];

    const destinationIndex = items.indexOf(destinationColumn);
    
    const [reorderedItem] = items.splice(sourceIndex, 1);
    items.splice(destinationIndex, 0, reorderedItem);
    
    setOrderedColumns(items);
    onColumnOrderChange(items);
  };
  
  const filteredColumns = orderedColumns.filter(column => {
    const normalizedColumn = normalizeColumnName(column);
    return column.toLowerCase().includes(searchQuery.toLowerCase()) &&
           !ALWAYS_HIDDEN_COLUMNS.includes(normalizedColumn);
  });

  // Determine if all eligible columns are currently visible
  const normalizedAllColumns = columns.filter(col => {
    const normalized = normalizeColumnName(col);
    return !ALWAYS_HIDDEN_COLUMNS.includes(normalized);
  });

  const areAllVisible = normalizedAllColumns.every(col => visibleColumns.includes(col));

  const handleToggleAll = () => {
    normalizedAllColumns.forEach(col => {
      const shouldBeVisible = !areAllVisible; // if all currently visible, we will hide them and vice-versa
      if (visibleColumns.includes(col) !== shouldBeVisible) {
        onColumnVisibilityChange(col, shouldBeVisible);
      }
    });
  };

  return (
    <div className={`p-4 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-lg max-h-96 overflow-hidden flex flex-col`}>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h3 className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            Manage Columns
          </h3>
          <button
            onClick={handleToggleAll}
            className={`p-1 rounded-md ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} transition-colors`}
            aria-label={areAllVisible ? 'Hide all columns' : 'Show all columns'}
          >
            {areAllVisible ? <CheckSquare size={18} /> : <Square size={18} />}
          </button>
        </div>
        <button
          onClick={onClose}
          className={`p-1 rounded-full ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} transition-colors`}
          aria-label="Close column manager"
        >
          <X size={18} />
        </button>
      </div>
      
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
      
      <div className="overflow-y-auto flex-1 -mr-2 pr-2">
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="columns">
            {(provided) => (
              <ul 
                className="space-y-1"
                {...provided.droppableProps}
                ref={provided.innerRef}
              >
                {filteredColumns.map((column, index) => {
                  const isVisible = visibleColumns.includes(column);
                  
                  return (
                    <Draggable key={column} draggableId={column} index={index}>
                      {(provided) => (
                        <li
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`flex items-center p-2 rounded-md ${
                            theme === 'dark'
                              ? 'hover:bg-gray-700'
                              : 'hover:bg-gray-100'
                          } transition-colors`}
                        >
                          <div 
                            {...provided.dragHandleProps}
                            className="mr-2 cursor-grab"
                          >
                            <GripVertical size={16} className={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} />
                          </div>
                          
                          <button
                            onClick={() => onColumnVisibilityChange(column, !isVisible)}
                            className={`w-5 h-5 mr-3 rounded-md flex items-center justify-center ${
                              isVisible 
                                ? 'bg-blue-500' 
                                : `${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-200'}`
                            }`}
                            aria-label={isVisible ? `Hide ${column}` : `Show ${column}`}
                          >
                            {isVisible && <Check size={14} className="text-white" />}
                          </button>
                          
                          <span className={`truncate ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>
                            {column}
                          </span>
                        </li>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </ul>
            )}
          </Droppable>
        </DragDropContext>
      </div>
    </div>
  );
};