# Flink 数据采样机制补丁
# 需要添加到 log_parser_job.py

class LogSampler:
    """日志数据采样器，参考 Splunk 采样策略"""
    
    def __init__(self, sampling_rate: Optional[float] = None, 
                 per_source_rate_map: Optional[Dict[str, float]] = None):
        """
        初始化采样器
        
        Args:
            sampling_rate: 全局采样率 (0.0-1.0)，默认为 None（不采样）
            per_source_rate_map: 按数据源的采样率配置 {source_id: rate}
        """
        # 全局采样率，默认 0.1 (10%)
        self.sampling_rate = sampling_rate if sampling_rate is not None else 0.1
        
        # 按数据源的采样率
        self.per_source_rate_map = per_source_rate_map or {}
        
        # 追踪每个源已处理的数据量（用于计数器采样）
        self.source_counters = defaultdict(int)
        
        logger.info(f"LogSampler 初始化 - 全局采样率: {self.sampling_rate}, "
                   f"按数据源配置: {self.per_source_rate_map}")
    
    def should_sample(self, log_id: str, source_id: Optional[int] = None,
                      force_disable_sampling: bool = False) -> bool:
        """
        判断是否应该采样该条日志
        
        Args:
            log_id: 日志的唯一标识（用于确定性采样）
            source_id: 数据源ID（用于按数据源的采样配置）
            force_disable_sampling: 强制禁用采样（调试用）
            
        Returns:
            True = 采样该日志，False = 丢弃该日志
        """
        # 如果强制禁用采样，返回 True
        if force_disable_sampling:
            logger.debug(f"强制启用采样: log_id={log_id}")
            return True
        
        # 如果采样率为 0，直接采集
        if self.sampling_rate <= 0:
            return True
        
        # 使用 hash 确定性采样（均匀分布）
        hash_val = int(hashlib.md5(log_id.encode('utf-8')).hexdigest(), 16)
        # 确保概率均匀，避免低概率采样问题
        probability = min(1.0, self.sampling_rate * (1000 / hash_val) if hash_val > 0 else self.sampling_rate)
        
        # 概率采样
        if hash_val % 1000 < (self.sampling_rate * 1000):
            logger.debug(f"概率采样命中 (rate={self.sampling_rate}): log_id={log_id}")
            return True
        
        # 按数据源的采样配置
        if source_id is not None and source_id in self.per_source_rate_map:
            source_rate = self.per_source_rate_map[source_id]
            if source_rate > 0 and source_rate < 1.0:
                if hash_val % 1000 < (source_rate * 1000):
                    logger.debug(f"数据源采样命中 (source={source_id}, rate={source_rate}): log_id={log_id}")
                    return True
        
        # 计数器采样选项（实际场景可启用）
        # if source_id is not None:
        #     self.source_counters[source_id] += 1
        #     counter_samples = int(1 / self.sampling_rate)
        #     sampled = self.source_counters[source_id] % counter_samples == 0
        #     if sampled:
        #         logger.debug(f"计数器采样命中 (source={source_id}, counter={self.source_counters[source_id]}): log_id={log_id}")
        #         return True
        
        return False
    
    def get_sampling_stats(self) -> Dict[str, Any]:
        """获取采样统计信息"""
        return {
            'global_sampling_rate': self.sampling_rate,
            'per_source_rates': self.per_source_rate_map,
            'source_counters': dict(self.source_counters)
        }


# 集成到处理流程的示例
# 在 create_flink_job() 函数中添加：
# 
# # 初始化采样器
# sample_rate = float(os.environ.get('LOG_SAMPLING_RATE', '0.1'))  # 默认 10% 采样
# per_source_sampling = json.loads(os.environ.get('PER_SOURCE_SAMPLING', '{}'))
# sampler = LogSampler(sampling_rate=sample_rate, per_source_rate_map=per_source_sampling)
# 
# # 修改 process_log 函数中的采样判断
# def process_log(element):
#     try:
#         log_id = element[0]
#         source_id = element[1] if len(element) > 1 else None
#         
#         # 采样判断
#         if not sampler.should_sample(log_id, source_id):
#             logger.info(f"日志被采样丢弃: log_id={log_id}, source_id={source_id}")
#             return None
#         
#         # ... 原有解析逻辑 ...
#         
#     except Exception as e:
#         logger.error(f"处理失败: {e}")
#         return None
#
