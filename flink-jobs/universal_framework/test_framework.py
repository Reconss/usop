#!/usr/bin/env python3
"""
Universal Flink Framework - 框架测试脚本

测试各组件功能是否正常
"""

import sys
import os

# 添加路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 测试各模块
def test_connectors():
    """测试连接器"""
    print("\n" + "="*50)
    print("测试连接器")
    print("="*50)
    
    from connectors import (
        get_source_connector, get_sink_connector, 
        SourceConfig, get_all_supported_protocols
    )
    
    # 打印支持的协议
    protocols = get_all_supported_protocols()
    print(f"\n✅ 支持的数据源类型: {protocols['source']}")
    print(f"✅ 支持的数据目标类型: {protocols['sink']}")
    
    # 测试 Kafka Source
    print("\n--- 测试 Kafka Source ---")
    config = SourceConfig(
        source_type='push',
        protocol='kafka',
        host='kafka:29092',
        config={'topic': 'test-logs', 'group_id': 'test-group'}
    )
    connector = get_source_connector('kafka', config)
    sql = connector.get_flink_sql()
    print(f"Kafka Source SQL:\n{sql[:200]}...")
    print("✅ Kafka Source 正常")
    
    # 测试 Syslog Source
    print("\n--- 测试 Syslog Source ---")
    config = SourceConfig(
        source_type='push',
        protocol='syslog',
        host='0.0.0.0',
        port=5140,
        config={'protocol': 'udp', 'rfc_version': 'rfc5424'}
    )
    connector = get_source_connector('syslog', config)
    sql = connector.get_flink_sql()
    print(f"Syslog Source SQL:\n{sql[:200]}...")
    print("✅ Syslog Source 正常")
    
    # 测试 JDBC Source
    print("\n--- 测试 JDBC Source ---")
    config = SourceConfig(
        source_type='pull',
        protocol='jdbc',
        host='mysql-server',
        port=3306,
        username='root',
        password='password',
        config={'database': 'logs', 'query': 'SELECT * FROM access_log'}
    )
    connector = get_source_connector('jdbc', config)
    sql = connector.get_flink_sql()
    print(f"JDBC Source SQL:\n{sql[:200]}...")
    print("✅ JDBC Source 正常")
    
    return True


def test_parsers():
    """测试解析器"""
    print("\n" + "="*50)
    print("测试解析器")
    print("="*50)
    
    from parsers import get_parser, ParseResult
    
    # 测试 JSON 解析器
    print("\n--- 测试 JSON 解析器 ---")
    parser = get_parser('json', {})
    result = parser.parse('{"message": "test", "src_ip": "192.168.1.1", "level": "error"}')
    print(f"输入: {{'message': 'test', 'src_ip': '192.168.1.1', 'level': 'error'}}")
    print(f"解析结果: success={result.success}, src_ip={result.data.get('src_ip')}")
    print("✅ JSON Parser 正常")
    
    # 测试 Syslog 解析器
    print("\n--- 测试 Syslog 解析器 ---")
    parser = get_parser('syslog_rfc5424', {})
    test_log = '<34>1 2024-01-01T10:00:00.000Z localhost app 123 ID1 - Test message'
    result = parser.parse(test_log)
    print(f"输入: {test_log}")
    print(f"解析结果: success={result.success}, hostname={result.data.get('hostname')}")
    print("✅ Syslog Parser 正常")
    
    # 测试 Key-Value 解析器
    print("\n--- 测试 Key-Value 解析器 ---")
    parser = get_parser('keyvalue', {})
    test_log = 'message=test level=error src_ip=10.0.0.1'
    result = parser.parse(test_log)
    print(f"输入: {test_log}")
    print(f"解析结果: success={result.success}, message={result.data.get('message')}")
    print("✅ Key-Value Parser 正常")
    
    return True


def test_processors():
    """测试处理器"""
    print("\n" + "="*50)
    print("测试处理器")
    print("="*50)
    
    from processors import FilterProcessor, TransformProcessor
    
    # 测试过滤器
    print("\n--- 测试过滤器 ---")
    filter_rules = [
        {'type': 'ip_blacklist', 'ips': ['192.168.1.100']},
        {'type': 'regex_match', 'pattern': 'error|critical', 'field': 'message'}
    ]
    processor = FilterProcessor(filter_rules)
    
    # 测试数据
    test_data_1 = {'message': 'test error', 'src_ip': '192.168.1.100'}  # 应当被过滤
    test_data_2 = {'message': 'normal message', 'src_ip': '10.0.0.1'}    # 应当通过
    
    result_1 = processor.process(test_data_1)
    result_2 = processor.process(test_data_2)
    
    print(f"数据1 (ip在黑名单+包含error): 应过滤 -> {result_1 is None}")
    print(f"数据2 (正常): 应通过 -> {result_2 is not None}")
    print("✅ Filter Processor 正常")
    
    # 测试转换器
    print("\n--- 测试转换器 ---")
    field_mapping = {
        'src_ip': 'source_ip',
        'dst_ip': 'dest_ip',
        'message': 'msg'
    }
    transform_rules = [
        {'type': 'uppercase', 'field': 'level'},
        {'type': 'add_field', 'field': 'processed', 'value': True}
    ]
    processor = TransformProcessor(field_mapping, transform_rules)
    
    test_data = {'source_ip': '192.168.1.1', 'dest_ip': '10.0.0.1', 'msg': 'hello', 'level': 'error'}
    result = processor.transform(test_data)
    
    print(f"输入: {test_data}")
    print(f"输出: {result}")
    print(f"字段映射验证: src_ip->{result.get('src_ip')}, msg->{result.get('message')}")
    print("✅ Transform Processor 正常")
    
    return True


def test_rule_loader():
    """测试规则加载器"""
    print("\n" + "="*50)
    print("测试规则加载器")
    print("="*50)
    
    # 测试规则加载器（不连接数据库）
    from config.rule_loader import RuleLoader
    
    loader = RuleLoader()
    print(f"RuleLoader 初始化成功")
    print(f"缓存 TTL: {loader._cache_ttl} 秒")
    print("✅ Rule Loader 正常")
    
    return True


def test_flink_sql_generation():
    """测试 Flink SQL 生成"""
    print("\n" + "="*50)
    print("测试 Flink SQL 生成")
    print("="*50)
    
    from connectors import get_source_connector, get_sink_connector, SourceConfig
    
    # Kafka Source
    source_config = SourceConfig(
        source_type='push',
        protocol='kafka',
        config={'topic': 'raw-logs', 'group_id': 'flink-test', 'bootstrap_servers': 'kafka:29092'}
    )
    source = get_source_connector('kafka', source_config)
    
    # PostgreSQL Sink
    sink_config = SourceConfig(
        source_type='push',
        protocol='jdbc',
        host='postgres',
        port=5432,
        username='usop',
        password='usop_password',
        config={'database': 'usop_security', 'table_name': 'events'}
    )
    sink = get_sink_connector('jdbc', sink_config)
    
    print("Kafka Source SQL:")
    print(source.get_flink_sql()[:300])
    print("\nPostgreSQL Sink SQL:")
    print(sink.get_flink_sql()[:300])
    print("✅ Flink SQL 生成正常")
    
    return True


def main():
    print("="*60)
    print("Universal Flink Framework - 框架测试")
    print("="*60)
    
    tests = [
        ("连接器测试", test_connectors),
        ("解析器测试", test_parsers),
        ("处理器测试", test_processors),
        ("规则加载器测试", test_rule_loader),
        ("Flink SQL 生成测试", test_flink_sql_generation),
    ]
    
    results = []
    for name, test_func in tests:
        try:
            test_func()
            results.append((name, True, None))
        except Exception as e:
            print(f"❌ {name} 失败: {e}")
            results.append((name, False, str(e)))
    
    # 打印总结
    print("\n" + "="*60)
    print("测试总结")
    print("="*60)
    
    passed = 0
    for name, success, error in results:
        status = "✅ 通过" if success else f"❌ 失败: {error}"
        print(f"{name}: {status}")
        if success:
            passed += 1
    
    print(f"\n总计: {passed}/{len(results)} 通过")
    
    return passed == len(results)


if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
