#!/usr/bin/env python3
"""
USOP UI 统一化 codemod
------------------------------------------------------------------
把散落在各页面里的 Tailwind 调色板硬编码色（bg-blue-500 / text-emerald-400 …）
收敛到设计系统语义令牌（primary / accent / success / warning / danger / info /
surface / text-*），并统一圆角与阴影档位。

用法：
  python codemod_unify_styles.py            # dry-run，只打印统计与样例
  python codemod_unify_styles.py --write    # 实际写回文件
"""
import re
import sys
import pathlib
import collections

ROOT = pathlib.Path('/Users/codes/usop/web/src')
WRITE = '--write' in sys.argv

# 语义家族映射
SEM = {
    'emerald': 'success', 'green': 'success', 'teal': 'success',
    'blue': 'info', 'cyan': 'info',
    'sky': 'primary',
    'indigo': 'accent', 'violet': 'accent', 'purple': 'accent',
    'amber': 'warning', 'yellow': 'warning', 'orange': 'warning',
    'rose': 'danger', 'red': 'danger', 'pink': 'danger',
}
NEUTRAL = {'gray', 'grey', 'zinc', 'slate', 'neutral', 'stone'}

FAMILIES = '|'.join(list(SEM) + sorted(NEUTRAL))

VARIANTS = (
    r'(?:(?:hover|focus|focus-visible|focus-within|active|disabled|group-hover|'
    r'group-focus|peer-checked|dark|first|last|odd|even|sm|md|lg|xl|2xl|'
    r'motion-safe|motion-reduce):)*'
)
PROPS = r'bg|text|border|from|to|via|ring|divide|placeholder|decoration|outline|caret|accent|fill|stroke|shadow'

PAT = re.compile(
    rf'(?<![\w-])({VARIANTS})({PROPS})-({FAMILIES})-(\d{{2,3}})(?:/((?:\d{{1,3}}|\[[^\]\s]+\])))?'
)

stats = collections.Counter()
samples = collections.defaultdict(list)


def alpha_suffix(alpha):
    return f'/{alpha}' if alpha else ''


def map_neutral(prop, shade, alpha, variant=''):
    s = int(shade)
    is_hover = 'hover' in variant
    if prop == 'text':
        if s <= 350:
            return 'text-text-secondary'
        if s <= 600:
            return 'text-text-muted'
        if s <= 750:
            return 'text-text-secondary'
        return 'text-text-primary'
    if prop == 'bg':
        if is_hover:
            return 'bg-surface-3' if (s >= 600 or alpha) else 'bg-surface-2'
        if alpha:
            return 'bg-surface-3'
        if s <= 750:
            return 'bg-surface-2'
        return 'bg-surface-3'
    if prop in ('border', 'divide'):
        return 'border-border-color' if prop == 'border' else 'divide-border-color'
    if prop == 'from' or prop == 'to' or prop == 'via':
        return f'{prop}-surface-2'
    if prop == 'ring':
        return 'ring-border-color'
    if prop == 'placeholder':
        return 'placeholder-text-muted'
    if prop in ('fill', 'stroke'):
        return f'{prop}-text-muted'
    if prop == 'shadow':
        return 'shadow-card'
    return None


# 「实心填充色」的目标家族：历史上 blue/indigo 就是主操作色 → 收敛到 primary
SOLID_TARGET = {
    'emerald': 'success', 'green': 'success', 'teal': 'success',
    'blue': 'primary', 'indigo': 'primary', 'cyan': 'info', 'sky': 'primary',
    'violet': 'accent', 'purple': 'accent',
    'amber': 'warning', 'yellow': 'warning', 'orange': 'warning',
    'rose': 'danger', 'red': 'danger', 'pink': 'danger',
}


def map_color(prop, fam, shade, alpha, variant=''):
    """返回替换后的完整工具类（不含变体前缀），无法映射时返回 None"""
    s = int(shade)

    if fam in NEUTRAL:
        return map_neutral(prop, shade, alpha, variant)

    sem = SEM[fam]
    a = alpha_suffix(alpha)
    solid = SOLID_TARGET.get(fam, sem)
    is_hover = 'hover' in variant

    if prop == 'text':
        # 浅色家族（*-50/100）在深色主题里做「底色文字」不合适，统一按浅底处理
        if s <= 200:
            return f'text-{sem}'
        return f'text-{sem}{a}'
    if prop == 'bg':
        if alpha:
            return f'bg-{sem}{a}'
        if s <= 300:
            return f'bg-{sem}/15'
        if s <= 450:
            return f'bg-{sem}'
        # 500+：实心填充；hover 变体用深一档的实心色，保证有可见反馈
        if is_hover:
            return f'bg-{solid}-solid-hover'
        return f'bg-{solid}-solid'
    if prop == 'border':
        return f'border-{sem}{a}'
    if prop in ('from', 'to', 'via'):
        return f'{prop}-{sem}{a}'
    if prop == 'ring':
        return f'ring-{sem}{a}'
    if prop == 'divide':
        return 'divide-border-color'
    if prop == 'placeholder':
        return 'placeholder-text-muted'
    if prop in ('fill', 'stroke'):
        return f'{prop}-{sem}{a}'
    if prop == 'outline':
        return f'outline-{sem}{a}'
    if prop == 'decoration':
        return f'decoration-{sem}{a}'
    if prop == 'caret':
        return f'caret-{sem}'
    if prop == 'accent':
        return f'accent-{sem}-solid'
    if prop == 'shadow':
        return 'shadow-card'
    return None


def sub_colors(text, path):
    def repl(m):
        variant, prop, fam, shade, alpha = m.groups()
        new = map_color(prop, fam, shade, alpha, variant)
        if new is None:
            stats['unmapped'] += 1
            samples['unmapped'].append(f'{path}: {m.group(0)}')
            return m.group(0)
        out = variant + new
        if len(samples[fam]) < 3:
            samples[fam].append(f'{m.group(0)}  →  {out}')
        stats[fam] += 1
        return out
    return PAT.sub(repl, text)


# 圆角 / 阴影 / 其他统一化（数值等价或更贴合的令牌）
SIMPLE = [
    (re.compile(r'(?<![\w-])rounded-2xl(?![\w-])'), 'rounded-panel'),
    (re.compile(r'(?<![\w-])rounded-xl(?![\w-])'), 'rounded-card'),
    (re.compile(r'(?<![\w-])shadow-(?:sm|md)(?![\w-])'), 'shadow-card'),
    (re.compile(r'(?<![\w-])shadow-(?:lg|xl|2xl)(?![\w-])'), 'shadow-panel'),
    # 遗留的编辑器/浏览器默认色
    (re.compile(r'(?<![\w-])bg-black/(\d{1,3})(?![\w-])'), r'bg-[rgb(4_8_20_/_\1%)]'),
]


def main():
    files = sorted(
        p for p in ROOT.rglob('*')
        if p.suffix in ('.tsx', '.ts') and p.is_file() and not p.name.endswith('.bak')
    )
    changed = 0
    for p in files:
        orig = p.read_text(encoding='utf-8')
        new = sub_colors(orig, p.name)
        for pat, rep in SIMPLE:
            new = pat.sub(rep, new)
        if new != orig:
            changed += 1
            if WRITE:
                p.write_text(new, encoding='utf-8')

    print(f'扫描文件 {len(files)} 个，{"改写" if WRITE else "将改写"} {changed} 个')
    print('\n=== 家族命中次数 ===')
    for k, v in stats.most_common():
        print(f'  {k:12} {v}')
    print('\n=== 映射样例 ===')
    for fam, ex in samples.items():
        if fam == 'unmapped':
            continue
        for e in ex[:2]:
            print(f'  [{fam:8}] {e}')
    if samples['unmapped']:
        print('\n=== 未映射（需人工处理）===')
        for e in samples['unmapped'][:30]:
            print('  ', e)


if __name__ == '__main__':
    main()
