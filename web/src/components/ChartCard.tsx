import React, { useState } from 'react';
import { Maximize2, Minimize2, MoreHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}

const ChartCard: React.FC<ChartCardProps> = ({ title, children, className = '', actions }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <AnimatePresence>
      <motion.div
        layout
        className={`
          bg-card-bg border border-border-color rounded-card overflow-hidden
          ${isFullscreen ? 'fixed inset-4 z-50' : 'relative'}
          ${className}
        `}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-color">
          <h3 className="text-card-title font-medium text-text-primary">{title}</h3>
          <div className="flex items-center gap-2">
            {actions}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-button text-text-secondary hover:text-text-primary hover:bg-primary/10 transition-colors cursor-pointer"
              title={isFullscreen ? '退出全屏' : '全屏'}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button className="p-1.5 rounded-button text-text-secondary hover:text-text-primary hover:bg-primary/10 transition-colors cursor-pointer">
              <MoreHorizontal size={16} />
            </button>
          </div>
        </div>
        <div className={`p-4 ${isFullscreen ? 'h-[calc(100%-60px)]' : ''}`}>
          {children}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ChartCard;
