/**
 * SearchBar — Graylog 风格搜索栏
 *
 * 功能：
 *  - query_string 输入（field:value、AND/OR/NOT、短语、通配符）
 *  - 语法提示下拉
 *  - 搜索按钮 + 快捷键 Enter
 *  - 命中数 / 耗时显示
 *  - 已保存搜索加载 / 保存
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Search, Clock, Save, Bookmark, X, Zap,
  Trash2, FolderOpen, HelpCircle,
} from 'lucide-react';
import { Button, Field, Modal } from './ui';

interface SavedSearch {
  id?: string;
  title: string;
  query: string;
  timeRange?: { start: string; end: string; label?: string };
  createdAt?: string;
}

interface SearchBarProps {
  value: string;
  onChange: (val: string) => void;
  onSearch: () => void;
  loading?: boolean;
  savedSearches?: SavedSearch[];
  onSaveSearch?: (title: string) => void;
  onLoadSearch?: (search: SavedSearch) => void;
  onDeleteSearch?: (id: string) => void;
  className?: string;
}

const SYNTAX_HINTS = [
  { syntax: 'field:value', example: 'severity:critical', desc: '精确字段匹配' },
  { syntax: 'field:"phrase"', example: 'title:"SQL Injection"', desc: '短语搜索' },
  { syntax: 'field:wild*', example: 'src_ip:10.0.*', desc: '通配符搜索' },
  { syntax: 'AND / OR / NOT', example: 'severity:high AND NOT status:closed', desc: '布尔运算' },
  { syntax: '(group)', example: '(severity:critical OR severity:high)', desc: '分组' },
  { syntax: '_exists_:field', example: '_exists_:raw_log', desc: '字段存在' },
  { syntax: 'field:[a TO b]', example: 'confidence:[80 TO 100]', desc: '范围查询' },
];

export const SearchBar: React.FC<SearchBarProps> = ({
  value, onChange, onSearch, loading,
  savedSearches = [], onSaveSearch, onLoadSearch, onDeleteSearch,
  className = '',
}) => {
  const [showHints, setShowHints] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveTitle, setSaveTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowHints(false);
        setShowSaved(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSearch();
      setShowHints(false);
    }
    if (e.key === 'Escape') {
      setShowHints(false);
      setShowSaved(false);
    }
  };

  const handleSave = () => {
    if (saveTitle.trim() && onSaveSearch) {
      onSaveSearch(saveTitle.trim());
      setSaveTitle('');
      setShowSaveDialog(false);
    }
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      {/* 主搜索栏 */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative min-w-0">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowHints(true)}
              placeholder='搜索告警…  语法: severity:critical AND src_ip:10.0.*'
              className="app-input h-[34px] py-0 pl-9 pr-16 font-mono text-xs"
              aria-label="搜索告警"
            />
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center">
              {value && (
                <button
                  type="button"
                  onClick={() => onChange('')}
                  className="rounded p-1 text-text-muted hover:text-text-primary transition-colors"
                  aria-label="清空搜索"
                >
                  <X size={13} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowHints(!showHints)}
                className="rounded p-1 text-text-muted hover:text-text-primary transition-colors"
                title="搜索语法帮助"
                aria-label="搜索语法帮助"
              >
                <HelpCircle size={14} />
              </button>
            </div>
          </div>

          {/* 语法提示下拉 */}
          {showHints && !showSaved && (
            <div className="absolute top-full left-0 right-0 mt-1 z-50 overflow-hidden app-card shadow-panel">
              <div className="px-4 py-2.5 border-b border-border-color">
                <span className="text-xs font-medium text-text-muted uppercase tracking-wide">搜索语法</span>
              </div>
              <div className="max-h-[280px] overflow-y-auto scrollbar-thin">
                {SYNTAX_HINTS.map((h, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-surface-2 cursor-pointer transition-colors"
                    onClick={() => {
                      onChange(value ? `${value} ${h.example}` : h.example);
                      inputRef.current?.focus();
                    }}
                  >
                    <code className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded font-mono whitespace-nowrap">
                      {h.syntax}
                    </code>
                    <span className="text-xs text-text-muted truncate flex-1">{h.desc}</span>
                    <code className="text-xs text-text-secondary font-mono">{h.example}</code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 已保存搜索下拉 */}
          {showSaved && (
            <div className="absolute top-full left-0 right-0 mt-1 z-50 overflow-hidden app-card shadow-panel">
              <div className="px-4 py-2.5 border-b border-border-color flex items-center justify-between">
                <span className="text-xs font-medium text-text-muted uppercase tracking-wide">已保存搜索</span>
                <span className="text-xs text-text-muted">{savedSearches.length} 条</span>
              </div>
              <div className="max-h-[280px] overflow-y-auto scrollbar-thin">
                {savedSearches.length === 0 ? (
                  <div className="px-4 py-6 text-center text-text-muted text-sm">
                    暂无已保存的搜索
                  </div>
                ) : savedSearches.map((s, i) => (
                  <div
                    key={s.id || i}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2 transition-colors group"
                  >
                    <Bookmark className="w-4 h-4 text-primary flex-shrink-0" />
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => {
                        onLoadSearch?.(s);
                        setShowSaved(false);
                      }}
                    >
                      <div className="text-sm text-text-primary truncate">{s.title}</div>
                      <div className="text-xs text-text-muted font-mono truncate">{s.query}</div>
                    </div>
                    {onDeleteSearch && s.id && (
                      <Button
                        variant="danger-ghost"
                        size="sm"
                        icon={Trash2}
                        className="h-6 w-6 px-0 opacity-0 group-hover:opacity-100"
                        title="删除"
                        aria-label={`删除 ${s.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSearch(s.id!);
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 搜索按钮 */}
        <Button
          variant="primary"
          icon={Search}
          loading={loading}
          onClick={onSearch}
        >
          搜索
        </Button>

        {/* 已保存搜索按钮 */}
        <Button
          variant={showSaved ? 'soft' : 'secondary'}
          icon={FolderOpen}
          onClick={() => { setShowSaved(!showSaved); setShowHints(false); }}
          title="已保存搜索"
          aria-label="已保存搜索"
          aria-expanded={showSaved}
        />

        {/* 保存当前搜索 */}
        {onSaveSearch && (
          <Button
            variant="secondary"
            icon={Save}
            onClick={() => setShowSaveDialog(true)}
            disabled={!value.trim()}
            title="保存当前搜索"
            aria-label="保存当前搜索"
          />
        )}
      </div>

      {/* 保存搜索对话框 */}
      {showSaveDialog && (
        <Modal
          open
          title="保存搜索"
          onClose={() => setShowSaveDialog(false)}
          width={440}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowSaveDialog(false)}>
                取消
              </Button>
              <Button variant="primary" onClick={handleSave} disabled={!saveTitle.trim()}>
                保存
              </Button>
            </>
          }
        >
          <div className="app-panel mb-3 text-xs font-mono text-text-secondary truncate-1">
            {value}
          </div>
          <Field label="搜索名称" required>
            <input
              type="text"
              value={saveTitle}
              onChange={(e) => setSaveTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              placeholder="输入搜索名称"
              className="app-input"
              autoFocus
            />
          </Field>
        </Modal>
      )}
    </div>
  );
};

export default SearchBar;
