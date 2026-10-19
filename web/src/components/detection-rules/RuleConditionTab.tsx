import React from 'react';
import SingleConditionEditor from './SingleConditionEditor';
import { Condition } from '../../types/detection-rules';

/**
 * 检测条件编辑器入口。
 *
 * 只渲染「单事件条件」编辑器：关联 / 时序两种多事件规则已下线，统一走
 * 「关联分析规则」（Flink 流作业）。原先的 CorrelationConditionEditor /
 * SequenceConditionEditor 已删除——它们生成的 groups / steps 结构后端从未支持。
 */
interface Props {
  selectedDataSources: (string | number)[];
  dataSources: { id: string | number; name: string }[];
  conditions: Condition[];
  timeWindow: number;
  timeUnit: string;
  threshold: number;
  groupBy: string;
  onConditionsChange: (c: Condition[]) => void;
  onTimeWindowChange: (v: number) => void;
  onTimeUnitChange: (v: string) => void;
  onThresholdChange: (v: number) => void;
  onGroupByChange: (v: string) => void;
}

export default function RuleConditionTab(props: Props) {
  return (
    <SingleConditionEditor
      conditions={props.conditions}
      selectedDataSources={props.selectedDataSources}
      dataSources={props.dataSources}
      timeWindow={props.timeWindow}
      timeUnit={props.timeUnit}
      threshold={props.threshold}
      groupBy={props.groupBy}
      onConditionsChange={props.onConditionsChange}
      onTimeWindowChange={props.onTimeWindowChange}
      onTimeUnitChange={props.onTimeUnitChange}
      onThresholdChange={props.onThresholdChange}
      onGroupByChange={props.onGroupByChange}
    />
  );
}
