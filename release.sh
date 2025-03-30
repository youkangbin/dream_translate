#!/bin/bash

DIST=./dist

# ======== Chrome & Edge ========
# 拷贝（去掉 src 后面的斜杠，确保复制整个目录）
echo "cp to ... $DIST"
mkdir -p "$DIST"
\cp -af ./src "$DIST/"  # 关键修改：去掉 src 后的斜杠

# 打包 (Chrome Edge)
sed -i "s/const isDebug = true/const isDebug = false/g" "$DIST/src/js/common.js"  # 路径修正
zip -rq dist.zip "$DIST"

# 清理目录
rm -rf "$DIST"
