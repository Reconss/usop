import React from 'react';
import { motion } from 'framer-motion';
import { Server, Database, Globe, Shield } from 'lucide-react';
import type { RiskAsset } from '../types';
import { useChartTokens, riskToken } from '../styles/chartTheme';

interface RiskAssetListProps {
  data: RiskAsset[];
}

const getIcon = (type: string) => {
  switch (type) {
    case 'server': return Server;
    case 'database': return Database;
    case 'service': return Globe;
    default: return Shield;
  }
};

const ProgressRing = ({ score, color, track }: { score: number; color: string; track: string }) => {
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative h-8 w-8 shrink-0">
      <svg className="h-8 w-8 -rotate-90">
        <circle cx="16" cy="16" r={radius} fill="none" stroke={track} strokeWidth="3" />
        <circle
          cx="16"
          cy="16"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-[11px] font-medium num"
        style={{ color }}
      >
        {score}
      </span>
    </div>
  );
};

const RiskAssetList: React.FC<RiskAssetListProps> = ({ data }) => {
  const t = useChartTokens();

  return (
    <div className="space-y-2">
      {data.map((asset, index) => {
        const Icon = getIcon(asset.type);
        const color = riskToken(t, asset.riskScore);
        return (
          <motion.div
            key={asset.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: index * 0.04 }}
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-transparent px-2.5 py-2 transition-colors hover:border-border-color hover:bg-surface-2"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate-1 text-[13px] font-medium text-text-primary">{asset.name}</p>
              <p className="truncate-1 text-[11px] text-text-muted">{asset.type}</p>
            </div>
            <ProgressRing score={asset.riskScore} color={color} track={t.axis} />
          </motion.div>
        );
      })}
    </div>
  );
};

export default RiskAssetList;

