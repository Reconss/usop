"""漏洞管理字段扩展迁移（幂等）

- vulnerabilities 补全知识库字段（CNVD/CNNVD/CWE/CVSS 向量/vuln_type/类别/参考链接/POC 公开等）
- asset_vulnerabilities 补全处置跟踪与重评字段（vuln_code/vuln_type/插件/位置/重评历史/时间线等）
"""
import sys

from sqlalchemy import text


def _cols(conn, table):
    res = conn.execute(text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name = :t"), {'t': table})
    return {row[0] for row in res}


VULN_COLUMNS = {
    'cnvd_id': "ALTER TABLE vulnerabilities ADD COLUMN cnvd_id VARCHAR(50)",
    'cnnvd_id': "ALTER TABLE vulnerabilities ADD COLUMN cnnvd_id VARCHAR(50)",
    'cwe_id': "ALTER TABLE vulnerabilities ADD COLUMN cwe_id VARCHAR(20)",
    'cvss3_score': "ALTER TABLE vulnerabilities ADD COLUMN cvss3_score DOUBLE PRECISION",
    'cvss2_score': "ALTER TABLE vulnerabilities ADD COLUMN cvss2_score DOUBLE PRECISION",
    'cvss_vector': "ALTER TABLE vulnerabilities ADD COLUMN cvss_vector VARCHAR(120)",
    'vuln_type': "ALTER TABLE vulnerabilities ADD COLUMN vuln_type VARCHAR(20) DEFAULT 'host'",
    'vuln_class': "ALTER TABLE vulnerabilities ADD COLUMN vuln_class VARCHAR(50)",
    'ref_links': "ALTER TABLE vulnerabilities ADD COLUMN ref_links TEXT",
    'poc_public': "ALTER TABLE vulnerabilities ADD COLUMN poc_public BOOLEAN DEFAULT FALSE",
    'disclosure_date': "ALTER TABLE vulnerabilities ADD COLUMN disclosure_date TIMESTAMP",
    'source': "ALTER TABLE vulnerabilities ADD COLUMN source VARCHAR(50) DEFAULT 'manual'",
    'updated_at': "ALTER TABLE vulnerabilities ADD COLUMN updated_at TIMESTAMP",
}

AV_COLUMNS = {
    'vuln_code': "ALTER TABLE asset_vulnerabilities ADD COLUMN vuln_code VARCHAR(64)",
    'vuln_type': "ALTER TABLE asset_vulnerabilities ADD COLUMN vuln_type VARCHAR(20) DEFAULT 'host'",
    'vuln_class': "ALTER TABLE asset_vulnerabilities ADD COLUMN vuln_class VARCHAR(50)",
    'cvss3_score': "ALTER TABLE asset_vulnerabilities ADD COLUMN cvss3_score DOUBLE PRECISION",
    'cvss2_score': "ALTER TABLE asset_vulnerabilities ADD COLUMN cvss2_score DOUBLE PRECISION",
    'assessed_severity': "ALTER TABLE asset_vulnerabilities ADD COLUMN assessed_severity VARCHAR(20)",
    'assess_factors': "ALTER TABLE asset_vulnerabilities ADD COLUMN assess_factors JSON",
    'assess_reason': "ALTER TABLE asset_vulnerabilities ADD COLUMN assess_reason TEXT",
    'assess_history': "ALTER TABLE asset_vulnerabilities ADD COLUMN assess_history JSON",
    'plugin_id': "ALTER TABLE asset_vulnerabilities ADD COLUMN plugin_id VARCHAR(50)",
    'plugin_name': "ALTER TABLE asset_vulnerabilities ADD COLUMN plugin_name VARCHAR(300)",
    'plugin_family': "ALTER TABLE asset_vulnerabilities ADD COLUMN plugin_family VARCHAR(100)",
    'hostname': "ALTER TABLE asset_vulnerabilities ADD COLUMN hostname VARCHAR(200)",
    'ip_address': "ALTER TABLE asset_vulnerabilities ADD COLUMN ip_address VARCHAR(64)",
    'port': "ALTER TABLE asset_vulnerabilities ADD COLUMN port INTEGER",
    'protocol': "ALTER TABLE asset_vulnerabilities ADD COLUMN protocol VARCHAR(20)",
    'url_path': "ALTER TABLE asset_vulnerabilities ADD COLUMN url_path VARCHAR(500)",
    'component_version': "ALTER TABLE asset_vulnerabilities ADD COLUMN component_version VARCHAR(200)",
    'assigned_at': "ALTER TABLE asset_vulnerabilities ADD COLUMN assigned_at TIMESTAMP",
    'repair_plan': "ALTER TABLE asset_vulnerabilities ADD COLUMN repair_plan TEXT",
    'deadline': "ALTER TABLE asset_vulnerabilities ADD COLUMN deadline TIMESTAMP",
    'verified_by': "ALTER TABLE asset_vulnerabilities ADD COLUMN verified_by VARCHAR(100)",
    'verified_at': "ALTER TABLE asset_vulnerabilities ADD COLUMN verified_at TIMESTAMP",
    'verify_result': "ALTER TABLE asset_vulnerabilities ADD COLUMN verify_result VARCHAR(20)",
    'close_reason': "ALTER TABLE asset_vulnerabilities ADD COLUMN close_reason TEXT",
    'source': "ALTER TABLE asset_vulnerabilities ADD COLUMN source VARCHAR(50) DEFAULT 'manual'",
    'updated_at': "ALTER TABLE asset_vulnerabilities ADD COLUMN updated_at TIMESTAMP",
    'timeline': "ALTER TABLE asset_vulnerabilities ADD COLUMN timeline JSON",
}

IDX_STMTS = [
    "CREATE INDEX IF NOT EXISTS ix_av_vuln_type ON asset_vulnerabilities (vuln_type)",
    "CREATE INDEX IF NOT EXISTS ix_av_status ON asset_vulnerabilities (status)",
    "CREATE INDEX IF NOT EXISTS ix_av_vuln_code ON asset_vulnerabilities (vuln_code)",
]


def migrate():
    from app import create_app
    from app.database import db

    app = create_app()
    with app.app_context():
        conn = db.engine.connect()
        existing_v = _cols(conn, 'vulnerabilities')
        existing_a = _cols(conn, 'asset_vulnerabilities')

        applied = 0
        for name, ddl in VULN_COLUMNS.items():
            if name not in existing_v:
                conn.execute(text(ddl))
                print(f'  vulnerabilities + {name}')
                applied += 1
        for name, ddl in AV_COLUMNS.items():
            if name not in existing_a:
                conn.execute(text(ddl))
                print(f'  asset_vulnerabilities + {name}')
                applied += 1

        for stmt in IDX_STMTS:
            conn.execute(text(stmt))

        # 回填 vuln_type（历史数据按 category 前缀推断，否则按资产类型）
        conn.execute(text(
            "UPDATE vulnerabilities SET vuln_type = 'application' "
            "WHERE vuln_type IS NULL AND category LIKE '%application%'"))
        conn.execute(text(
            "UPDATE vulnerabilities SET vuln_type = 'host' WHERE vuln_type IS NULL"))
        conn.execute(text(
            "UPDATE asset_vulnerabilities SET vuln_type = 'host' WHERE vuln_type IS NULL"))
        # v3 分数回填到主评分
        conn.execute(text(
            "UPDATE asset_vulnerabilities SET cvss3_score = cvss_score "
            "WHERE cvss3_score IS NULL AND cvss_score IS NOT NULL"))
        conn.execute(text(
            "UPDATE vulnerabilities SET cvss3_score = cvss_score "
            "WHERE cvss3_score IS NULL AND cvss_score IS NOT NULL"))
        conn.commit()
        conn.close()
        print(f'migration done, {applied} columns added')


if __name__ == '__main__':
    migrate()
    sys.exit(0)
