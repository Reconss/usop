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

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Clock, Save, Bookmark, ChevronDown, X, Zap,
  Trash2, FolderOpen, HelpCircle, Loader2
} from 'lucide-react';

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
  hitCount?: number | null;
  tookMs?: number | null;
  loading?: boolean;
  savedSearches?: SavedSearch[];
  onSaveSearch?: (title: string) => void;
  onLoadSearch?: (search: SavedSearch) => void;
  onDeleteSearch?: (id: string) => void;
  timeRangeLabel?: string;
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
  value, onChange, onSearch, hitCount, tookMs, loading,
  savedSearches = [], onSaveSearch, onLoadSearch, onDeleteSearch,
  timeRangeLabel, className = '',
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
        <div className="flex-1 relative">
          <div className="flex items-center bg-page-bg border border-border-color rounded-xl overflow-hidden
                          focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
            <Search className="w-4 h-4 text-text-muted ml-4 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowHints(true)}
              placeholder='搜索告警…  语法: severity:critical AND src_ip:10.0.*'
              className="flex-1 bg-transparent px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted
                         focus:outline-none font-mono"
            />
            {value && (
              <button
                onClick={() => onChange('')}
                className="p-2 text-text-muted hover:text-text-secondary transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => setShowHints(!showHints)}
              className="p-2 text-text-muted hover:text-text-secondary transition-colors"
              title="搜索语法帮助"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>

          {/* 语法提示下拉 */}
          <AnimatePresence>
            {showHints && !showSaved && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="absolute top-full left-0 right-0 mt-1 bg-card-bg border border-border-color
                           rounded-xl shadow-2xl z-50 overflow-hidden"
              >
                <div className="px-4 py-2.5 border-b border-border-color">
                  <span className="text-xs font-medium text-text-muted uppercase tracking-wide">搜索语法</span>
                </div>
                <div className="max-h-[280px] overflow-y-auto">
                  {SYNTAX_HINTS.map((h, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-white/5 cursor-pointer transition-colors"
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
              </motion.div>
            )}
          </AnimatePresence>

          {/* 已保存搜索下拉 */}
          <AnimatePresence>
            {showSaved && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="absolute top-full left-0 right-0 mt-1 bg-card-bg border border-border-color
                           rounded-xl shadow-2xl z-50 overflow-hidden"
              >
                <div className="px-4 py-2.5 border-b border-border-color flex items-center justify-between">
                  <span className="text-xs font-medium text-text-muted uppercase tracking-wide">已保存搜索</span>
                  <span className="text-xs text-text-muted">{savedSearches.length} 条</span>
                </div>
                <div className="max-h-[280px] overflow-y-auto">
                  {savedSearches.length === 0 ? (
                    <div className="px-4 py-6 text-center text-text-muted text-sm">
                      暂无已保存的搜索
                    </div>
                  ) : savedSearches.map((s, i) => (
                    <div
                      key={s.id || i}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors group"
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
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSearch(s.id!);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-rose-400 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 搜索按钮 */}
        <button
          onClick={onSearch}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl
                     hover:bg-primary/90 disabled:opacity-50 transition-all font-medium text-sm"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          搜索
        </button>

        {/* 已保存搜索按钮 */}
        <button
          onClick={() => { setShowSaved(!showSaved); setShowHints(false); }}
          className="flex items-center gap-1.5 px-3 py-2.5 bg-page-bg border border-border-color rounded-xl
                     text-text-secondary hover:border-primary/40 hover:text-primary transition-all text-sm"
          title="已保存搜索"
        >
          <FolderOpen className="w-4 h-4" />
        </button>

        {/* 保存当前搜索 */}
        {onSaveSearch && (
          <button
            onClick={() => setShowSaveDialog(true)}
            disabled={!value.trim()}
            className="flex items-center gap-1.5 px-3 py-2.5 bg-page-bg border border-border-color rounded-xl
                       text-text-secondary hover:border-primary/40 hover:text-primary disabled:opacity-40
                       transition-all text-sm"
            title="保存当前搜索"
          >
            <Save className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 状态栏：命中数 + 耗时 + 时间范围 */}
      <div className="flex items-center gap-4 mt-2 min-h-[20px]">
        {hitCount != null && (
          <span className="text-xs text-text-muted flex items-center gap-1">
            <Zap className="w-3 h-3 text-primary" />
            <span className="text-text-secondary font-medium">{hitCount.toLocaleString()}</span> 条结果
          </span>
        )}
        {tookMs != null && (
          <span className="text-xs text-text-muted flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {tookMs}ms
          </span>
        )}
        {timeRangeLabel && (
          <span className="text-xs text-text-muted flex items-center gap-1">
            时间范围: <span className="text-text-secondary">{timeRangeLabel}</span>
          </span>
        )}
      </div>

      {/* 保存搜索对话框 */}
      <AnimatePresence>
        {showSaveDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowSaveDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-card-bg rounded-2xl p-6 w-full max-w-md border border-border-color"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-text-primary mb-4">保存搜索</h3>
              <div className="mb-2 text-xs text-text-muted font-mono bg-page-bg rounded-lg px-3 py-2 truncate">
                {value}
              </div>
              <input
                type="text"
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                placeholder="输入搜索名称"
                className="w-full px-4 py-3 bg-page-bg border border-border-color rounded-xl text-text-primary
                           focus:border-primary focus:outline-none mb-4"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setShowSaveDialog(false)}
                  className="flex-1 py-2.5 bg-page-bg text-text-secondary rounded-xl hover:bg-white/5 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={!saveTitle.trim()}
                  className="flex-1 py-2.5 bg-primary text-white rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  保存
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SearchBar;
