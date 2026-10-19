import React, { useState, useEffect } from 'react';
import {
  Database, Check, ChevronRight, Server, Globe, MessageSquare, Terminal,
  Cloud, Lock, FolderOpen, Wifi,
} from 'lucide-react';
import { dataSourcesApi } from '../../services/api';
import { EmptyState, LoadingState, StateBadge } from '../ui';

interface DataSource {
  id: number | string;
  name: string;
  type: string;
  status: string;
  protocol?: string;
  totalEvents?: number;
  parsePipelines?: number[];
}

const protocolIcons: Record<string, React.ElementType> = {
  kafka: MessageSquare, rabbitmq: MessageSquare, http: Globe, https: Lock,
  s3: Cloud, syslog: Terminal, webhook: Globe, grpc: Wifi, tcp: Wifi,
  udp: Wifi, file: FolderOpen, ftp: FolderOpen, sftp: Lock, jdbc: Database,
  redis: Database, elasticsearch: Database
};

interface Props {
  selectedDataSources: string[];
  onChange: (ids: string[]) => void;
}

export default function RuleDataSourceTab({ selectedDataSources, onChange }: Props) {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    dataSourcesApi.getDataSources({ page_size: 100, configured: true })
      .then((res: any) => {
        if (res.success) {
          const items = Array.isArray(res.data) ? res.data : res.data?.items || [];
          setDataSources(items.map((item: any) => ({
            id: item.id,
            name: item.name || item.source_name,
            type: item.type || item.source_type,
            status: item.status || 'active',
            protocol: item.protocol,
            totalEvents: item.message_count || item.totalEvents
          })));
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const toggleSource = (id: string) => {
    onChange(
      selectedDataSources.includes(id)
        ? selectedDataSources.filter(s => s !== id)
        : [...selectedDataSources, id]
    );
  };

  if (loading) {
    return <LoadingState label="正在加载数据源…" />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[13px] font-medium text-text-primary">关联数据源（可选）</h3>
          <p className="mt-1 text-caption text-text-muted">
            限定规则只在选定来源的告警上评估；不选则在全部告警上评估
          </p>
        </div>
        {selectedDataSources.length > 0 && (
          <span className="chip shrink-0">已关联 {selectedDataSources.length} 个</span>
        )}
      </div>

      {dataSources.length === 0 ? (
        <EmptyState
          compact
          icon={Database}
          title="暂无可用的数据源"
          description="如需按来源限定检测范围，请先在「数据采集」中接入数据源"
        />
      ) : (
        <div className="flex max-h-80 flex-col gap-2 overflow-auto scrollbar-thin pr-0.5">
          {dataSources.map((source) => {
            const ProtocolIcon = protocolIcons[source.type?.toLowerCase()] || Server;
            const sourceId = String(source.id);
            const isSelected = selectedDataSources.includes(sourceId);
            const online = source.status === 'connected' || source.status === 'active';
            return (
              <button
                key={source.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => toggleSource(sourceId)}
                className={[
                  'flex w-full items-center gap-3 rounded-input border p-3 text-left transition-colors',
                  isSelected
                    ? 'border-primary/60 bg-primary/10'
                    : 'border-border-color bg-surface-1 hover:border-border-color-hover hover:bg-surface-2',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border',
                    isSelected ? 'border-primary bg-primary text-white' : 'border-border-strong bg-surface-1',
                  ].join(' ')}
                >
                  {isSelected && <Check size={12} strokeWidth={3} />}
                </span>

                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-input border border-border-color bg-surface-2">
                  <ProtocolIcon size={16} className="text-primary" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate-1 text-[13px] font-medium text-text-primary">{source.name}</span>
                    <StateBadge
                      state={online ? 'active' : 'inactive'}
                      label={online ? '已连接' : '已断开'}
                    />
                  </span>
                  <span className="mt-0.5 flex items-center gap-3 text-caption text-text-muted">
                    <span className="flex items-center gap-1">
                      <Database size={11} />{source.protocol || source.type}
                    </span>
                    {source.totalEvents !== undefined && (
                      <span className="num">{(source.totalEvents / 1000).toFixed(1)}K 事件</span>
                    )}
                  </span>
                </span>

                <ChevronRight size={14} className="shrink-0 text-text-muted" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
