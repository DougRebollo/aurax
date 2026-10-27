#!/usr/bin/env python3
"""Acrescenta ?v=<hash do conteúdo> nos CSS/JS locais de cada página, para o navegador baixar a versão nova
logo depois de um deploy (o GitHub Pages deixa os arquivos em cache por ~10 min). O hash só muda quando o
arquivo muda. Rode antes de commitar mudanças em CSS/JS:  python3 tools/cache-bust.py"""
import glob, hashlib, os, re

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(root)
PAT = re.compile(r'(href|src)="((?!https?:|data:|//)[^"?#]+\.(?:css|js))(?:\?v=[0-9a-f]+)?"')

def short_hash(path):
    with open(path, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()[:8]

changed = 0
for page in sorted(glob.glob("*.html")):
    if page.startswith("_"):
        continue
    html = open(page, encoding="utf-8").read()
    def sub(m):
        path = m.group(2)
        if not os.path.exists(path):
            return m.group(0)
        return f'{m.group(1)}="{path}?v={short_hash(path)}"'
    new = PAT.sub(sub, html)
    if new != html:
        open(page, "w", encoding="utf-8").write(new)
        changed += 1
print(f"cache-bust: {changed} página(s) atualizada(s)")
