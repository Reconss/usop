#!/bin/bash
# ==========================================
# ES 初始化脚本 — 创建索引模板 + ILM 策略 + 初始索引
# ==========================================
# 用法: ./scripts/es-setup.sh [http://localhost:9200]
# ==========================================

ES_URL="${1:-http://localhost:9200}"

echo "🔄 连接 ES: ${ES_URL}"

# 等待 ES 就绪
for i in $(seq 1 30); do
  if curl -sf "${ES_URL}/_cluster/health" > /dev/null 2>&1; then
    echo "✅ ES 已就绪 ($(curl -sf "${ES_URL}/_cluster/health" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])") )"
    break
  fi
  echo "⏳ 等待 ES 就绪... (${i}/30)"
  sleep 2
done

# ==========================================
# 1. ILM 策略
# ==========================================
echo ""
echo "📋 创建 ILM 策略: usop-alerts-policy"

curl -s -X PUT "${ES_URL}/_ilm/policy/usop-alerts-policy" -H "Content-Type: application/json" -d '{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": {
            "max_age": "1d",
            "max_size": "10GB"
          },
          "set_priority": {
            "priority": 100
          }
        }
      },
      "warm": {
        "min_age": "30d",
        "actions": {
          "set_priority": {
            "priority": 50
          }
        }
      },
      "delete": {
        "min_age": "90d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('  ✅' if d.get('acknowledged') else '  ❌ '+str(d))"

# ==========================================
# 2. 索引模板
# ==========================================
echo ""
echo "📋 创建索引模板: usop-alerts-template"

curl -s -X PUT "${ES_URL}/_index_template/usop-alerts-template" -H "Content-Type: application/json" -d '{
  "index_patterns": ["usop-alerts-*"],
  "priority": 100,
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "refresh_interval": "30s",
      "index.lifecycle.name": "usop-alerts-policy",
      "index.lifecycle.rollover_alias": "usop-alerts"
    },
    "mappings": {
      "dynamic": false,
      "properties": {
        "id":            {"type": "long"},
        "alert_code":    {"type": "keyword"},
        "title":         {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
        "description":   {"type": "text"},
        "severity":      {"type": "keyword"},
        "status":        {"type": "keyword"},
        "source":        {"type": "keyword"},
        "source_product": {"type": "keyword"},
        "source_type":   {"type": "keyword"},
        "category":      {"type": "keyword"},
        "confidence":    {"type": "float"},
        "src_ip":        {"type": "ip"},
        "src_port":      {"type": "integer"},
        "dst_ip":        {"type": "ip"},
        "dst_port":      {"type": "integer"},
        "protocol":      {"type": "keyword"},
        "asset_id":      {"type": "long"},
        "asset_name":    {"type": "keyword"},
        "hostname":      {"type": "keyword"},
        "affected_assets": {"type": "keyword"},
        "event_ids":     {"type": "long"},
        "assigned_to":   {"type": "long"},
        "raw_log":       {"type": "text", "index": false},
        "extra_data":    {"type": "flattened"},
        "tags":          {"type": "keyword"},
        "first_seen":    {"type": "date", "format": "yyyy-MM-dd HH:mm:ss||yyyy-MM-dd||epoch_millis"},
        "last_seen":     {"type": "date"},
        "created_at":    {"type": "date"},
        "updated_at":    {"type": "date"}
      }
    }
  }
}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('  ✅' if d.get('acknowledged') else '  ❌ '+str(d))"

# ==========================================
# 3. 初始索引（写入别名）
# ==========================================
echo ""
echo "📋 创建初始索引: usop-alerts-000001"

TODAY=$(date +%Y.%m.%d)
curl -s -X PUT "${ES_URL}/usop-alerts-000001" -H "Content-Type: application/json" -d '{
  "aliases": {
    "usop-alerts-write": {
      "is_write_index": true
    },
    "usop-alerts": {
      "is_write_index": true
    }
  }
}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('  ✅' if d.get('acknowledged') else '  ❌ '+str(d))"

# ==========================================
# 4. Stream 索引
# ==========================================
echo ""
echo "📋 创建 streams 索引"

curl -s -X PUT "${ES_URL}/usop-streams" -H "Content-Type: application/json" -d '{
  "settings": {
    "number_of_shards": 1,
    "number_of_replicas": 0
  },
  "mappings": {
    "dynamic": false,
    "properties": {
      "id":          {"type": "keyword"},
      "title":       {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
      "description": {"type": "text"},
      "rules":       {"type": "nested", "properties": {
        "field": {"type": "keyword"},
        "type":  {"type": "keyword"},
        "value": {"type": "keyword"}
      }},
      "disabled":    {"type": "boolean"},
      "created_at":  {"type": "date"}
    }
  }
}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('  ✅' if d.get('acknowledged') else '  ❌ '+str(d))"

# ==========================================
# 5. Saved Searches 索引
# ==========================================
echo ""
echo "📋 创建 saved-searches 索引"

curl -s -X PUT "${ES_URL}/usop-saved-searches" -H "Content-Type: application/json" -d '{
  "settings": {
    "number_of_shards": 1,
    "number_of_replicas": 0
  },
  "mappings": {
    "dynamic": false,
    "properties": {
      "id":          {"type": "keyword"},
      "title":       {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
      "query":       {"type": "object", "enabled": false},
      "user_id":     {"type": "long"},
      "shared":      {"type": "boolean"},
      "created_at":  {"type": "date"}
    }
  }
}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('  ✅' if d.get('acknowledged') else '  ❌ '+str(d))"

echo ""
echo "=========================================="
echo "✅ ES 初始化完成!"
echo "  索引模板:    usop-alerts-template"
echo "  ILM 策略:    usop-alerts-policy"
echo "  告警索引:    usop-alerts-000001 (write alias: usop-alerts-write)"
echo "  Streams:     usop-streams"
echo "  保存搜索:    usop-saved-searches"
echo "=========================================="
