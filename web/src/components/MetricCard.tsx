import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  trend: number;
  icon: React.ElementType;
  color: string;
}

export default function MetricCard({ title, value, trend, icon: Icon, color }: MetricCardProps) {
  const isPositive = trend > 0;
  const isNeutral = trend === 0;

  return (
    <motion.div
      className="metric-card p-5 cursor-pointer"
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br`} style={{ background: `linear-gradient(135deg, ${color}30, ${color}10)` }}>
            <Icon size={18} style={{ color }} />
          </div>
            <span className="text-text-secondary text-sm">{title}</span>
          </div>
          <div className="text-3xl font-bold text-text-primary mb-2">{value}</div>
          <div className="flex items-center gap-1">
            {isPositive ? (
              <TrendingUp size={14} className="text-critical" />
            ) : isNeutral ? (
              <Minus size={14} className="text-text-muted" />
            ) : (
              <TrendingDown size={14} className="text-success" />
            )}
            <span className={`text-sm ${isPositive ? 'text-critical' : isNeutral ? 'text-text-muted' : 'text-success'}`}>
              {isPositive ? '↑' : isNeutral ? '' : '↓'} {Math.abs(trend)}%
            </span>
            <span className="text-text-muted text-sm ml-1">较昨日</span>
          </div>
        </div>
      </div>
      <div className="mt-4 h-8 flex items-end gap-1">
        {[40, 65, 45, 80, 55, 70, 60].map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm transition-all duration-300 hover:opacity-80"
            style={{
              height: `${h}%`,
              backgroundColor: color,
              opacity: i === 6 ? 1 : 0.4 + (i * 0.05)
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}
