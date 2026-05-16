import React from 'react';
import SingleConditionEditor from './SingleConditionEditor';
import CorrelationConditionEditor from './CorrelationConditionEditor';
import SequenceConditionEditor from './SequenceConditionEditor';
import { RuleType, Condition, CorrelationGroup, SequenceStep } from '../../types/detection-rules';

interface Props {
  ruleType: RuleType;
  selectedDataSources: (string | number)[];
  dataSources: { id: string | number; name: string }[];
  // 单事件
  conditions: Condition[];
  timeWindow: number;
  timeUnit: string;
  threshold: number;
  groupBy: string;
  // 关联
  groups: CorrelationGroup[];
  groupLogic: 'AND' | 'OR';
  overallTimeWindow: string;
  // 时序
  steps: SequenceStep[];
  maxSpan: string;
  // 回调
  onConditionsChange: (c: Condition[]) => void;
  onTimeWindowChange: (v: number) => void;
  onTimeUnitChange: (v: string) => void;
  onThresholdChange: (v: number) => void;
  onGroupByChange: (v: string) => void;
  onGroupsChange: (g: CorrelationGroup[]) => void;
  onGroupLogicChange: (v: 'AND' | 'OR') => void;
  onOverallTimeWindowChange: (v: string) => void;
  onStepsChange: (s: SequenceStep[]) => void;
  onMaxSpanChange: (v: string) => void;
}

export default function RuleConditionTab(props: Props) {
  switch (props.ruleType) {
    case 'correlation':
      return (
        <CorrelationConditionEditor
          groups={props.groups}
          groupLogic={props.groupLogic}
          overallTimeWindow={props.overallTimeWindow}
          threshold={props.threshold}
          thresholdEnabled={true}
          selectedDataSources={props.selectedDataSources}
          dataSources={props.dataSources}
          onGroupsChange={props.onGroupsChange}
          onGroupLogicChange={props.onGroupLogicChange}
          onOverallTimeWindowChange={props.onOverallTimeWindowChange}
          onThresholdChange={props.onThresholdChange}
        />
      );

    case 'sequence':
      return (
        <SequenceConditionEditor
          steps={props.steps}
          maxSpan={props.maxSpan}
          threshold={props.threshold}
          selectedDataSources={props.selectedDataSources}
          dataSources={props.dataSources}
          onStepsChange={props.onStepsChange}
          onMaxSpanChange={props.onMaxSpanChange}
          onThresholdChange={props.onThresholdChange}
        />
      );

    case 'single':
    default:
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
}
