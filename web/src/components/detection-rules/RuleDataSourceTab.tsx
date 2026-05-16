import React, { useState, useEffect } from 'react';
import { Database, CheckCircle, ChevronRight, Server, Globe, MessageSquare, Terminal, Cloud, Lock, FolderOpen, Wifi } from 'lucide-react';
import { dataSourcesApi } from '../../services/api';

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
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-text-primary">关联数据源</h3>
          <p className="text-xs text-text-muted mt-1">选择规则要监控的数据源，仅显示已配置存储的数据源</p>
        </div>
        {selectedDataSources.length > 0 && (
          <span className="text-xs text-text-muted">已关联 {selectedDataSources.length} 个数据源</span>
        )}
      </div>

      {dataSources.length === 0 && (
        <div className="text-center py-10 text-text-muted border border-dashed border-border-color rounded-lg">
          <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>暂无可用的已配置数据源</p>
          <p className="text-xs mt-1">请先在「数据源管理」中配置日志类型和存储表</p>
        </div>
      )}

      <div className="space-y-2 max-h-80 overflow-auto">
        {dataSources.map((source) => {
          const ProtocolIcon = protocolIcons[source.type?.toLowerCase()] || Server;
          const sourceId = String(source.id);
          const isSelected = selectedDataSources.includes(sourceId);
          return (
            <div key={source.id}
              onClick={() => toggleSource(sourceId)}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                isSelected ? 'border-primary bg-primary/5' : 'border-border-color hover:border-primary/50'
              }`}>
              <div className={`w-5 h-5 rounded border flex items-center justify-center ${isSelected ? 'bg-primary border-primary' : 'border-text-muted'}`}>
                {isSelected && <CheckCircle className="w-3.5 h-3.5 text-white" />}
              </div>
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <ProtocolIcon className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text-primary">{source.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    source.status === 'connected' || source.status === 'active'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-text-muted/20 text-text-muted'
                  }`}>
                    {source.status === 'connected' || source.status === 'active' ? '已连接' : '已断开'}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
                  <span className="flex items-center gap-1"><Database className="w-3 h-3" />{source.protocol || source.type}</span>
                  {source.totalEvents !== undefined && (
                    <span>{(source.totalEvents / 1000).toFixed(1)}K 事件</span>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-text-muted" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
