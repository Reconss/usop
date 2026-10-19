"""Flink SQL Gateway / JobManager REST 客户端。

USOP 的「关联分析」能力由 Flink 流作业承担：
  规则（PG correlation_rules）→ 生成 Flink SQL → 通过 SQL Gateway 提交到会话集群
  → Kafka(valid-alerts) → 窗口关联分析 → JDBC sink 写入 PG events 表

网关与 JobManager 都在 log-platform 网络内，后端容器可直接以容器名访问。
可用环境变量覆盖：
  FLINK_SQL_GATEWAY_URL   默认 http://flink-jobmanager:8083
  FLINK_JOBMANAGER_URL    默认 http://flink-jobmanager:8081
"""
import json
import logging
import os
import time
import urllib.error
import urllib.request

logger = logging.getLogger(__name__)

GATEWAY_URL = os.getenv('FLINK_SQL_GATEWAY_URL', 'http://flink-jobmanager:8083').rstrip('/')
JOBMANAGER_URL = os.getenv('FLINK_JOBMANAGER_URL', 'http://flink-jobmanager:8081').rstrip('/')

CORRELATION_JOB_NAME = 'USOP-Correlation-Analysis'


class FlinkError(RuntimeError):
    """Flink 交互失败（连接、HTTP 错误、SQL 语法/执行错误）。"""


def _http(method, url, body=None, timeout=60):
    data = None
    if body is not None:
        data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode('utf-8', 'ignore')
    except urllib.error.HTTPError as e:
        detail = e.read().decode('utf-8', 'ignore')[:2000]
        raise FlinkError(f'Flink 返回 HTTP {e.code}：{detail}')
    except Exception as e:  # 连接失败 / 超时
        raise FlinkError(f'无法连接 Flink（{url}）：{e}')
    if not raw.strip():
        return {}
    try:
        return json.loads(raw)
    except ValueError:
        raise FlinkError(f'Flink 返回非 JSON：{raw[:300]}')


# ==================== 可用性 ====================

def gateway_available():
    """SQL Gateway 是否在线。"""
    try:
        _http('GET', f'{GATEWAY_URL}/v1/info', timeout=6)
        return True
    except FlinkError:
        return False


def cluster_overview():
    """JobManager 概览（集群是否在线 + 槽位）。"""
    return _http('GET', f'{JOBMANAGER_URL}/overview', timeout=8)


# ==================== 会话与语句执行 ====================

def create_session(properties=None):
    body = {'properties': properties} if properties else {}
    res = _http('POST', f'{GATEWAY_URL}/v1/sessions', body=body, timeout=20)
    sid = res.get('sessionHandle')
    if not sid:
        raise FlinkError(f'创建会话失败：{res}')
    return sid


def close_session(sid):
    try:
        _http('DELETE', f'{GATEWAY_URL}/v1/sessions/{sid}', timeout=10)
    except FlinkError as e:
        logger.warning('关闭 Flink 会话失败（忽略）：%s', e)


def execute(sid, statement):
    """提交一条语句，返回 operationHandle。"""
    res = _http('POST', f'{GATEWAY_URL}/v1/sessions/{sid}/statements',
                body={'statement': statement}, timeout=60)
    oh = res.get('operationHandle')
    if not oh:
        raise FlinkError(f'提交语句失败：{res}')
    return oh


def fetch_result(sid, oh, token=0):
    return _http('GET', f'{GATEWAY_URL}/v1/sessions/{sid}/operations/{oh}/result/{token}',
                 timeout=30)


def wait_result(sid, oh, tries=40, interval=1.5):
    """轮询直到语句产出结果（NOT_READY 视为未完成）。"""
    last = None
    for _ in range(max(1, tries)):
        last = fetch_result(sid, oh)
        rtype = last.get('resultType')
        if rtype != 'NOT_READY':
            return last
        time.sleep(interval)
    return last or {}


def _raise_if_error(res, statement):
    if res.get('resultType') == 'EOS':
        return
    # 网关把 SQL 错误放在 errors 字段
    errs = res.get('errors')
    if errs:
        raise FlinkError(f'SQL 执行失败：{errs} | 语句：{statement[:200]}')


def run_statement(sid, statement, tries=40):
    """执行一条语句并等待结果；返回 (resultType, job_id, errors)。"""
    oh = execute(sid, statement)
    res = wait_result(sid, oh, tries=tries)
    errs = res.get('errors')
    if errs:
        raise FlinkError(f'SQL 执行失败：{errs} | 语句：{statement[:220]}')
    return res.get('resultType'), res.get('jobID'), res


# ==================== 作业管理 ====================

def list_jobs():
    """列出集群作业（只在跑的）。"""
    data = _http('GET', f'{JOBMANAGER_URL}/jobs/overview', timeout=10)
    return data.get('jobs', []) or []


def find_correlation_jobs():
    """按名称找出关联分析作业（可能残留多个，需全部取消）。"""
    return [j for j in list_jobs() if j.get('name') == CORRELATION_JOB_NAME]


def cancel_job(job_id):
    try:
        _http('PATCH', f'{JOBMANAGER_URL}/jobs/{job_id}?mode=cancel', timeout=15)
        return True
    except FlinkError as e:
        logger.warning('取消作业 %s 失败：%s', job_id, e)
        return False


def cancel_correlation_jobs():
    """取消全部关联分析作业，返回被取消的 job id 列表。"""
    cancelled = []
    for j in find_correlation_jobs():
        if j.get('state') in ('RUNNING', 'RESTARTING', 'CREATED', 'INITIALIZING', 'RECONCILING'):
            if cancel_job(j['jid']):
                cancelled.append(j['jid'])
    return cancelled


# ==================== 脚本提交（一次会话内执行多条语句） ====================

# ⚠️ 关键：SQL Gateway 的会话被关闭时，**该会话提交的作业会被一起取消**。
# 所以长跑作业所在的会话必须保持打开，不能执行完就 close_session。
# 这里用模块级 + 落盘（/tmp）双重记录当前部署会话，便于后端重启后仍能显式关闭。
_SESSION_FILE = '/tmp/usop_flink_deploy_session'
_deploy_session = None


def _remember_session(sid):
    global _deploy_session
    _deploy_session = sid
    try:
        with open(_SESSION_FILE, 'w', encoding='utf-8') as f:
            f.write(sid or '')
    except OSError:
        pass


def current_deploy_session():
    """返回当前（或上次落盘的）部署会话 id。"""
    global _deploy_session
    if _deploy_session:
        return _deploy_session
    try:
        with open(_SESSION_FILE, 'r', encoding='utf-8') as f:
            _deploy_session = f.read().strip() or None
    except OSError:
        _deploy_session = None
    return _deploy_session


def close_deploy_session():
    """关闭上一次的部署会话（会连带取消其中的作业）；部署新作业前调用。"""
    sid = current_deploy_session()
    if sid:
        close_session(sid)
    _remember_session(None)


def submit_script(statements, job_name=CORRELATION_JOB_NAME, keep_session=True):
    """在同一个会话里按顺序执行多条语句，并**保持会话打开**（否则作业会被取消）。

    statements: List[str]，通常为 [DDL..., EXECUTE STATEMENT SET ... END]
    返回 {'job_id':…, 'statements':N, 'session':sid, 'detail':[…]}
    """
    sid = create_session()
    job_id = None
    executed = []
    try:
        # 1) 先给作业命名，便于后续按名称定位/取消
        run_statement(sid, f"SET 'pipeline.name' = '{job_name}'")
        for stmt in statements:
            rtype, jid, _ = run_statement(sid, stmt)
            executed.append({
                'statement': stmt.splitlines()[0][:120],
                'resultType': rtype,
                'jobID': jid,
            })
            if jid:
                job_id = jid
        if keep_session:
            _remember_session(sid)
        return {'job_id': job_id, 'statements': len(executed), 'session': sid, 'detail': executed}
    except Exception:
        # 失败时把会话收掉，避免残留半成品
        close_session(sid)
        raise
