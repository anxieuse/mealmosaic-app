import React, { useState, useCallback } from 'react';
import { Check, X, CheckSquare, Square, ChevronRight, ChevronDown } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export interface CategoryNode {
  name: string;
  path: string; // complete path including self (delimiter '#')
  children: CategoryNode[];
}

interface CategoryManagerProps {
  tree: CategoryNode[];
  selected: Set<string>;
  onSelectionChange: (newSelection: Set<string>) => void;
  onClose: () => void;
}

// Helper to get flat list of all paths in a subtree
const collectPaths = (nodes: CategoryNode[]): string[] => {
  const acc: string[] = [];
  const dfs = (n: CategoryNode[]) => {
    n.forEach(node => {
      acc.push(node.path);
      if (node.children.length) dfs(node.children);
    });
  };
  dfs(nodes);
  return acc;
};

export const CategoryManager: React.FC<CategoryManagerProps> = ({
  tree,
  selected,
  onSelectionChange,
  onClose
}) => {
  const { theme } = useTheme();

  const flatAllPaths = React.useMemo(() => collectPaths(tree), [tree]);

  const areAllSelected = flatAllPaths.every(p => selected.has(p));

  const toggleAll = () => {
    const newSel = new Set<string>();
    if (!areAllSelected) {
      flatAllPaths.forEach(p => newSel.add(p));
    }
    onSelectionChange(newSel);
  };

  // Toggle a single category with cascading rules
  const togglePath = (path: string) => {
    const newSel = new Set<string>(selected);
    const isSelected = newSel.has(path);

    const descendants = flatAllPaths.filter(p => p === path || p.startsWith(path + '#'));

    if (isSelected) {
      // unselect path and all descendants
      descendants.forEach(d => newSel.delete(d));
    } else {
      // select path, descendants, and ancestors
      descendants.forEach(d => newSel.add(d));
      // ancestors
      const parts = path.split('#');
      for (let i = 1; i < parts.length; i++) {
        const ancestorPath = parts.slice(0, i).join('#');
        newSel.add(ancestorPath);
      }
      // root path (# empty) not needed.
    }
    onSelectionChange(newSel);
  };

  // Expand/collapse state per node path
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const isExpanded = useCallback((path: string) => expanded[path] ?? true, [expanded]);
  const toggleExpand = (path: string) => {
    setExpanded(prev => ({ ...prev, [path]: !isExpanded(path) }));
  };

  const renderNodes = (nodes: CategoryNode[], level = 0) => {
    return (
      <ul className="space-y-1">
        {nodes.map(node => {
          const checked = selected.has(node.path);
          const hasChildren = node.children.length > 0;
          return (
            <li key={node.path} className="flex flex-col">
              <div
                className={`flex items-center p-1 rounded-md ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} transition-colors`}
                style={{ paddingLeft: level * 12 }}
              >
                {hasChildren && (
                  <button
                    className="mr-1 text-gray-500"
                    onClick={() => toggleExpand(node.path)}
                  >
                    {isExpanded(node.path) ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronRight size={14} />
                    )}
                  </button>
                )}
                {!hasChildren && <span style={{ width: 14, display: 'inline-block' }}></span>}
                <button
                  onClick={() => togglePath(node.path)}
                  className={`w-4 h-4 mr-2 rounded-sm flex items-center justify-center ${
                    checked ? 'bg-blue-500' : theme === 'dark' ? 'bg-gray-600' : 'bg-gray-200'
                  }`}
                >
                  {checked && <Check size={12} className="text-white" />}
                </button>
                <span className={`truncate ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>{node.name || 'Пустая категория'}</span>
              </div>
              {hasChildren && isExpanded(node.path) && (
                <div>{renderNodes(node.children, level + 1)}</div>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className={`p-4 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-lg max-h-96 overflow-hidden flex flex-col`}>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h3 className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Categories</h3>
          <button
            onClick={toggleAll}
            className={`p-1 rounded-md ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} transition-colors`}
            aria-label={areAllSelected ? 'Unselect all categories' : 'Select all categories'}
          >
            {areAllSelected ? <CheckSquare size={18} /> : <Square size={18} />}
          </button>
        </div>
        <button
          onClick={onClose}
          className={`p-1 rounded-full ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} transition-colors`}
          aria-label="Close category manager"
        >
          <X size={18} />
        </button>
      </div>

      <div className="overflow-y-auto flex-1 -mr-2 pr-2">
        {renderNodes(tree)}
      </div>
    </div>
  );
}; 