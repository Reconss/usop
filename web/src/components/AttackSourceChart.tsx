import React from 'react';
import { Globe } from 'lucide-react';
import { useChartTokens } from '../styles/chartTheme';

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
  const t = useChartTokens();
  const maxCount = Math.max(1, ...data.map((d) => d.count));

  if (!data.length) {
    return <div className="py-8 text-center text-[12px] text-text-muted">暂无数据</div>;
  }

  return (
    <div className="space-y-3">
      {data.map((source, index) => (
        <div key={source.ip} className="flex items-center gap-3">
          <span className="num w-5 shrink-0 text-[11px] text-text-muted">{index + 1}</span>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center text-[15px]">
            {countryFlags[source.country] || <Globe className="h-3.5 w-3.5 text-text-muted" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="truncate-1 font-mono text-[12.5px] text-text-primary">{source.ip}</span>
              <span className="num shrink-0 text-[11px] text-text-muted">{source.count} 次</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full transition-[width] duration-500 ease-out"
                style={{
                  width: `${Math.max(3, (source.count / maxCount) * 100)}%`,
                  background: `linear-gradient(90deg, ${t.primary}, ${t.accent})`,
                }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
