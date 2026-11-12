#!/usr/bin/env python3
"""把 src/ 下的样式、引擎、内容与应用组装成单文件 index.html，并生成 manifest.json。

用法：
    python3 build_site.py
只依赖标准库与 node（用于导出 manifest）。
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"

CONTENT_FILES = [
    "content/seeds.js",
    "content/meta.js",
    "content/lessons-a.js",
    "content/lessons-b.js",
    "content/quizzes.js",
]

PLACEHOLDERS = ["/*__STYLES__*/", "/*__ENGINE__*/", "/*__CONTENT__*/", "/*__APP__*/"]


def read(path: Path) -> str:
    if not path.exists():
        raise SystemExit(f"缺少文件：{path}")
    return path.read_text(encoding="utf-8")


def build_html() -> str:
    shell = read(SRC / "shell.html")
    styles = read(SRC / "styles.css")
    engine = read(SRC / "engine.js")
    app = read(SRC / "app.js")
    content = "\n\n".join(
        "/* ---- %s ---- */\n%s" % (name, read(SRC / name)) for name in CONTENT_FILES
    )

    for placeholder in PLACEHOLDERS:
        count = shell.count(placeholder)
        if count != 1:
            raise SystemExit(f"占位符 {placeholder} 应出现一次，实际 {count} 次")

    shell = shell.replace("/*__STYLES__*/", styles)
    shell = shell.replace("/*__ENGINE__*/", engine)
    shell = shell.replace("/*__CONTENT__*/", content)
    shell = shell.replace("/*__APP__*/", app)

    if "</script" in content.lower() or "</script" in app.lower():
        raise SystemExit("内联脚本里出现 </script，会截断页面，请先转义")

    return shell


def build_manifest() -> dict:
    script = ROOT / "_work" / "build" / "export_manifest.js"
    if not script.exists():
        raise SystemExit(f"缺少 manifest 导出脚本：{script}")
    proc = subprocess.run(
        ["node", str(script)],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise SystemExit("manifest 导出失败：\n" + proc.stderr)
    return json.loads(proc.stdout)


def main() -> None:
    html = build_html()
    out = ROOT / "index.html"
    out.write_text(html, encoding="utf-8")

    manifest = build_manifest()
    (ROOT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (ROOT / ".nojekyll").write_text("", encoding="utf-8")

    chapters = len(manifest.get("chapters", []))
    quizzes = len(manifest.get("quizzes", []))
    size_kb = out.stat().st_size / 1024
    print(f"已生成 {out}（{size_kb:.1f} KB，{chapters} 章 / {quizzes} 题）")
    print(f"已生成 {ROOT / 'manifest.json'}")
    print(f"已生成 {ROOT / '.nojekyll'}")


if __name__ == "__main__":
    main()
