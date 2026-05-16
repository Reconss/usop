"""
Hermes AI Agent — DeepSeek 代理服务
提供 OpenAI 兼容 API 和 Agent 执行能力
"""
import os
import json
import logging
from datetime import datetime
from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
from openai import OpenAI

logging.basicConfig(level=os.getenv('LOG_LEVEL', 'INFO'))
logger = logging.getLogger('hermes')

app = Flask(__name__)
CORS(app)

DEEPSEEK_API_KEY = os.getenv('DEEPSEEK_API_KEY', 'sk-bf41b5f890024a739325b3f765129dbc')
DEEPSEEK_BASE_URL = os.getenv('DEEPSEEK_BASE_URL', 'https://api.deepseek.com/v1')
DEEPSEEK_MODEL = os.getenv('DEEPSEEK_MODEL', 'deepseek-chat')

AGENTS = {
    'agent-1': {
        'name': '威胁分析助手',
        'description': '自动分析安全事件，识别攻击模式和威胁情报',
        'capabilities': ['事件分析', '威胁情报', '攻击链重建'],
        'system_prompt': (
            "你是一名威胁分析专家。请对输入的安全事件进行深入分析，"
            "识别攻击模式、关联威胁情报，并重建攻击链。"
            "输出 JSON 格式，包含：severity（严重程度）、attack_type（攻击类型）、"
            "kill_chain（攻击链阶段）、recommendations（处置建议列表）。"
        ),
    },
    'agent-2': {
        'name': '日志解析专家',
        'description': '解析复杂日志，提取关键安全指标和异常行为',
        'capabilities': ['日志解析', '异常检测', '模式识别'],
        'system_prompt': (
            "你是一名日志分析专家。请解析输入的日志数据，"
            "提取关键字段，检测异常模式。"
            "输出 JSON 格式，包含：parsed_fields（解析字段列表）、"
            "anomalies（检测到的异常）、confidence（置信度）。"
        ),
    },
    'agent-3': {
        'name': '调查协作者',
        'description': '协助安全调查，提供分析建议和关联信息',
        'capabilities': ['关联分析', '证据收集', '报告生成'],
        'system_prompt': (
            "你是一名安全调查专家。请根据输入的事件信息，"
            "进行关联分析，收集证据线索，生成调查报告。"
            "输出 JSON 格式，包含：related_events（关联事件）、"
            "evidence（证据列表）、timeline（时间线）、report_summary（报告摘要）。"
        ),
    },
    'agent-4': {
        'name': '合规检查员',
        'description': '检查安全策略合规性，识别配置风险',
        'capabilities': ['合规检查', '策略审计', '风险评估'],
        'system_prompt': (
            "你是一名合规审计专家。请检查输入的安全配置和策略，"
            "识别合规风险，提供整改建议。"
            "输出 JSON 格式，包含：check_results（检查项列表）、"
            "violations（违规项）、risk_level（风险等级）、recommendations（整改建议）。"
        ),
    },
}


def get_client():
    return OpenAI(
        api_key=DEEPSEEK_API_KEY,
        base_url=DEEPSEEK_BASE_URL,
    )


@app.route('/health', methods=['GET'])
def health():
    """健康检查"""
    return jsonify({
        'status': 'ok',
        'service': 'hermes-agent',
        'timestamp': datetime.utcnow().isoformat(),
        'upstream': DEEPSEEK_BASE_URL,
        'model': DEEPSEEK_MODEL,
    })


@app.route('/v1/chat/completions', methods=['POST'])
def chat_completions():
    """OpenAI 兼容的聊天补全接口（代理到 DeepSeek）"""
    data = request.get_json()
    stream = data.get('stream', False)
    model = data.get('model', DEEPSEEK_MODEL)

    logger.info(f"Chat completion: model={model}, stream={stream}, messages={len(data.get('messages', []))}")

    try:
        client = get_client()
        response = client.chat.completions.create(
            model=model,
            messages=data.get('messages', []),
            temperature=data.get('temperature', 0.7),
            max_tokens=data.get('max_tokens', 4096),
            stream=stream,
        )

        if stream:
            return Response(
                stream_with_context(_proxy_stream(response)),
                mimetype='text/event-stream',
                headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'},
            )

        return jsonify(response.to_dict())

    except Exception as e:
        logger.error(f"Chat completion error: {e}")
        return jsonify({'error': f'DeepSeek API 调用失败: {str(e)}'}), 503


def _proxy_stream(openai_stream):
    """透传 DeepSeek SSE 流，添加标准 OpenAI 结束标记"""
    for chunk in openai_stream:
        yield f"data: {json.dumps(chunk.model_dump())}\n\n"
    yield "data: [DONE]\n\n"


@app.route('/v1/models', methods=['GET'])
def list_models():
    """返回可用模型列表"""
    return jsonify({
        'data': [
            {'id': DEEPSEEK_MODEL, 'object': 'model', 'created': int(datetime.utcnow().timestamp()), 'owned_by': 'deepseek'},
        ]
    })


@app.route('/api/agents', methods=['GET'])
def list_agents():
    """获取所有可用 Agent"""
    agents = []
    for agent_id, agent in AGENTS.items():
        agents.append({
            'id': agent_id,
            'name': agent['name'],
            'description': agent['description'],
            'capabilities': agent['capabilities'],
        })
    return jsonify({'success': True, 'data': agents})


@app.route('/api/agents/<agent_id>/execute', methods=['POST'])
def execute_agent(agent_id):
    """执行 Agent 任务（调用 DeepSeek 分析）"""
    agent = AGENTS.get(agent_id)
    if not agent:
        return jsonify({'success': False, 'error': f'Agent {agent_id} 不存在'}), 404

    data = request.get_json()
    input_data = data.get('input', {})

    logger.info(f"Agent execute: {agent_id} ({agent['name']})")

    try:
        client = get_client()
        response = client.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=[
                {"role": "system", "content": agent['system_prompt']},
                {"role": "user", "content": json.dumps(input_data, ensure_ascii=False)},
            ],
            temperature=data.get('temperature', 0.3),
            max_tokens=4096,
            response_format={"type": "json_object"},
        )

        result_text = response.choices[0].message.content
        try:
            result = json.loads(result_text)
        except json.JSONDecodeError:
            result = {"summary": result_text[:200], "recommendations": ["请手动分析详情"], "confidence": 0.5}

        return jsonify({
            'success': True,
            'data': {
                'agent_id': agent_id,
                'agent_name': agent['name'],
                'result': result,
                'executed_at': datetime.utcnow().isoformat(),
            }
        })

    except Exception as e:
        logger.error(f"Agent execution error: {e}")
        return jsonify({'success': False, 'error': f'Agent 执行失败: {str(e)}'}), 503


if __name__ == '__main__':
    port = int(os.getenv('PORT', 8080))
    debug = os.getenv('DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=port, debug=debug)
