import React from 'react';
import { motion } from 'framer-motion';
import { Globe } from 'lucide-react';

interface AttackSource {
  ip: string;
  country: string;
  count: number;
}

interface AttackSourceChartProps {
  data: AttackSource[];
}

const countryFlags: Record<string, string> = {
  CN: '🇨🇳',
  US: '🇺🇸',
  RU: '🇷🇺',
  BR: '🇧🇷',
  IN: '🇮🇳'
};

export default function AttackSourceChart({ data }: AttackSourceChartProps) {
  const maxCount = Math.max(...data.map(d => d.count));

  return (
    <div className="space-y-3">
      {data.map((source, index) => (
        <motion.div
          key={source.ip}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1 }}
          className="flex items-center gap-3"
        >
          <span className="text-text-muted text-sm w-6">{index + 1}</span>
          <span className="text-lg">{countryFlags[source.country] || <Globe className="w-4 h-4 text-text-muted" />}</span>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-text-primary text-sm font-medium">{source.ip}</span>
              <span className="text-text-secondary text-xs">{source.count}次</span>
            </div>
            <div className="h-2 bg-card-bg rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(source.count / maxCount) * 100}%` }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
              />
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
