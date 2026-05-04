import React from 'react';
import { motion } from 'framer-motion';
import { Server, Database, Globe, Shield } from 'lucide-react';
import type { RiskAsset } from '../types';

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

const getRiskColor = (score: number) => {
  if (score >= 80) return '#ef4444';
  if (score >= 60) return '#f97316';
  if (score >= 40) return '#eab308';
  return '#10b981';
};

const ProgressRing = ({ score }: { score: number }) => {
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = getRiskColor(score);

  return (
    <div className="relative w-8 h-8">
      <svg className="w-8 h-8 transform -rotate-90">
        <circle cx="16" cy="16" r={radius} fill="none" stroke="var(--border-color)" strokeWidth="3" />
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
      <span className="absolute inset-0 flex items-center justify-center text-xs font-medium" style={{ color }}>
        {score}
      </span>
    </div>
  );
};

const RiskAssetList: React.FC<RiskAssetListProps> = ({ data }) => {
  return (
    <div className="space-y-3">
      {data.map((asset, index) => {
        const Icon = getIcon(asset.type);
        return (
          <motion.div
            key={asset.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="flex items-center gap-3 p-3 rounded-lg bg-page-bg/50 hover:bg-page-bg cursor-pointer transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">{asset.name}</p>
              <p className="text-xs text-text-muted">{asset.type}</p>
            </div>
            <ProgressRing score={asset.riskScore} />
          </motion.div>
        );
      })}
    </div>
  );
};

export default RiskAssetList;
