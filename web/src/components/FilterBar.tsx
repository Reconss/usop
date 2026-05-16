import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, X, Calendar, Clock } from 'lucide-react';

interface FilterOption {
  value: string;
  label: string;
  color?: string;
  bgColor?: string;
}

interface FilterDropdownProps {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  multiple?: boolean;
}

const FilterDropdown: React.FC<FilterDropdownProps> = ({
  label,
  options,
  selected,
  onChange,
  multiple = true
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (value: string) => {
    if (multiple) {
      if (selected.includes(value)) {
        onChange(selected.filter(v => v !== value));
      } else {
        onChange([...selected, value]);
      }
    } else {
      onChange([value]);
      setIsOpen(false);
    }
  };

  const getDisplayText = () => {
    if (selected.length === 0) return label;
    if (selected.length === 1) {
      const opt = options.find(o => o.value === selected[0]);
      return opt?.label || label;
    }
    return `${label} (${selected.length})`;
  };

  const isSelected = (value: string) => selected.includes(value);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all duration-200
          ${selected.length > 0 
            ? 'bg-primary/10 border-primary/50 text-primary' 
            : 'bg-card-bg border-border-color text-text-secondary hover:border-border-color-hover'
          }
        `}
      >
        <span className="text-sm font-medium">{getDisplayText()}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-2 min-w-[160px] bg-card-bg border border-border-color rounded-lg shadow-lg overflow-hidden z-50"
          >
            <div className="py-1 max-h-[280px] overflow-y-auto">
              {options.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleSelect(option.value)}
                  className={`
                    w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                    ${isSelected(option.value) 
                      ? 'bg-primary/10 text-primary' 
                      : 'text-text-primary hover:bg-card-bg-hover'
                    }
                  `}
                >
                  {multiple && (
                    <div className={`
                      w-4 h-4 rounded border flex items-center justify-center transition-all
                      ${isSelected(option.value) 
                        ? 'bg-primary border-primary' 
                        : 'border-border-color'
                      }
                    `}>
                      {isSelected(option.value) && <Check className="w-3 h-3 text-white" />}
                    </div>
                  )}
                  {option.color && (
                    <span className={`w-2 h-2 rounded-full ${option.color}`} />
                  )}
                  <span className="text-sm">{option.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// 时间范围预设选项
const timePresets = [
  { value: 'today', label: '今天' },
  { value: 'last7d', label: '近7天' },
  { value: 'last30d', label: '近30天' },
  { value: 'custom', label: '自定义' },
];

interface TimeRangePickerProps {
  value: { start: string; end: string };
  onChange: (value: { start: string; end: string }) => void;
}

export const TimeRangePicker: React.FC<TimeRangePickerProps> = ({ value, onChange }) => {
  const [preset, setPreset] = useState('last7d');
  const [showCustom, setShowCustom] = useState(false);

  const applyPreset = (presetValue: string) => {
    setPreset(presetValue);
    const now = new Date();
    let start = new Date();
    let end = new Date();

    switch (presetValue) {
      case 'today':
        start.setHours(0, 0, 0, 0);
        break;
      case 'last7d':
        start.setDate(start.getDate() - 7);
        break;
      case 'last30d':
        start.setDate(start.getDate() - 30);
        break;
      case 'custom':
        setShowCustom(true);
        return;
    }

    setShowCustom(false);
    onChange({
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10)
    });
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 p-1 bg-page-bg rounded-lg border border-border-color">
        {timePresets.map((p) => (
          <button
            key={p.value}
            onClick={() => applyPreset(p.value)}
            className={`
              px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200
              ${preset === p.value 
                ? 'bg-primary text-white shadow-sm' 
                : 'text-text-secondary hover:text-text-primary hover:bg-card-bg-hover'
              }
            `}
          >
            {p.label}
          </button>
        ))}
      </div>

      {showCustom && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={value.start}
            onChange={(e) => onChange({ ...value, start: e.target.value })}
            className="px-3 py-2 bg-page-bg border border-border-color rounded-lg text-sm text-text-primary focus:outline-none focus:border-primary"
          />
          <span className="text-text-muted">至</span>
          <input
            type="date"
            value={value.end}
            onChange={(e) => onChange({ ...value, end: e.target.value })}
            className="px-3 py-2 bg-page-bg border border-border-color rounded-lg text-sm text-text-primary focus:outline-none focus:border-primary"
          />
        </div>
      )}
    </div>
  );
};

export { FilterDropdown };
