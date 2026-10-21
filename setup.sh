#!/usr/bin/env bash
#
# photoSwitch 本地开发环境一键安装脚本
#
#   ./setup.sh                 # 安装后端 + 前端依赖（模型按需询问 / 跳过）
#   ./setup.sh --with-model    # 同时下载 CLIP 模型权重（约 600MB）
#   ./setup.sh --skip-frontend # 只装后端
#
# 完成后使用：
#   make dev        同时启动后端(7001) 与前端(7003)
#   make stop       停止全部服务
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
VENV_DIR="$BACKEND_DIR/.venv"
VENV_PY="$VENV_DIR/bin/python"
MODEL_DIR="$BACKEND_DIR/models/clip-vit-base-patch32"
HF_REPO="openai/clip-vit-base-patch32"
# 国内网络下载模型更稳定的镜像，可用环境变量 HF_ENDPOINT 覆盖
DEFAULT_HF_ENDPOINT="https://hf-mirror.com"
DATA_DIR="${PHOTOSWITCH_DATA_DIR:-$ROOT_DIR/.data}"

PYTHON_BIN="${PYTHON:-}"
WITH_MODEL=""
SKIP_BACKEND=0
SKIP_FRONTEND=0

# ---------- 输出辅助 ----------
if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
  C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_INFO=$'\033[36m'
else
  C_RESET=""; C_BOLD=""; C_DIM=""; C_OK=""; C_WARN=""; C_ERR=""; C_INFO=""
fi

step() { printf '\n%s==> %s%s\n' "$C_BOLD$C_INFO" "$1" "$C_RESET"; }
ok()   { printf '%s  ✓%s %s\n' "$C_OK" "$C_RESET" "$1"; }
info() { printf '%s  ·%s %s\n' "$C_DIM" "$C_RESET" "$1"; }
warn() { printf '%s  !%s %s\n' "$C_WARN" "$C_RESET" "$1" >&2; }
die()  { printf '%s  ✗ %s%s\n' "$C_ERR" "$1" "$C_RESET" >&2; exit 1; }

usage() {
  cat <<EOF
photoSwitch 安装脚本

用法: ./setup.sh [选项]

选项:
  --with-model        安装依赖后下载 CLIP 模型权重（约 600MB，相似分组必需）
  --skip-model        不下载模型（后续可用 make model 补下）
  --skip-backend      跳过 Python 虚拟环境与后端依赖安装
  --skip-frontend     跳过 npm install
  --python <路径>     指定用于创建虚拟环境的 Python 解释器（默认自动探测 3.10+）
  --data-dir <路径>   项目数据目录（默认 <仓库>/.data）
  -h, --help          显示本帮助

环境变量:
  PYTHON              同 --python
  HF_ENDPOINT         Hugging Face 下载地址（默认 ${DEFAULT_HF_ENDPOINT}）
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --with-model)    WITH_MODEL="yes"; shift ;;
    --skip-model)    WITH_MODEL="no"; shift ;;
    --skip-backend)  SKIP_BACKEND=1; shift ;;
    --skip-frontend) SKIP_FRONTEND=1; shift ;;
    --python)        PYTHON_BIN="${2:-}"; shift 2 ;;
    --data-dir)      DATA_DIR="${2:-}"; shift 2 ;;
    -h|--help)       usage; exit 0 ;;
    *)               usage; die "未知参数: $1" ;;
  esac
done

py_at_least() {  # py_at_least <解释器> <major> <minor>
  "$1" -c "import sys; sys.exit(0 if sys.version_info >= ($2, $3) else 1)" >/dev/null 2>&1
}

py_version() { "$1" -c 'import sys; print("%d.%d.%d" % sys.version_info[:3])'; }

printf '%s\n' "$C_BOLD  photoSwitch · 本地环境安装$C_RESET"
info "仓库目录: $ROOT_DIR"

# ---------- 1. 探测 Python ----------
step "1/5 检查 Python 环境"

if [ -n "$PYTHON_BIN" ]; then
  command -v "$PYTHON_BIN" >/dev/null 2>&1 || [ -x "$PYTHON_BIN" ] \
    || die "找不到指定的 Python: ${PYTHON_BIN}（可用 --python 重新指定）"
elif [ "$SKIP_BACKEND" -eq 0 ]; then
  # 后端依赖（numpy 2.2 / scikit-learn 1.7）需要 Python 3.10+，优先挑选新版本
  for candidate in python3.13 python3.12 python3.11 python3.10 python3 python; do
    found="$(command -v "$candidate" 2>/dev/null || true)"
    [ -n "$found" ] || continue
    if py_at_least "$found" 3 10; then PYTHON_BIN="$found"; break; fi
    if [ -z "${FALLBACK_PY:-}" ] && py_at_least "$found" 3 9; then FALLBACK_PY="$found"; fi
  done
  if [ -z "$PYTHON_BIN" ]; then
    if [ -n "${FALLBACK_PY:-}" ]; then
      PYTHON_BIN="$FALLBACK_PY"
      warn "仅找到 Python $(py_version "$PYTHON_BIN")；requirements.txt 中的 numpy/scikit-learn 版本需要 3.10+，安装可能失败"
      warn "建议先安装新版 Python：brew install python@3.12 ，然后 PYTHON=python3.12 ./setup.sh"
    else
      die "未找到 Python 3.9+，请先安装：brew install python@3.12"
    fi
  fi
fi

if [ "$SKIP_BACKEND" -eq 0 ]; then
  ok "Python $(py_version "$PYTHON_BIN")  (${PYTHON_BIN})"
fi

# ---------- 2. 检查 Node / npm ----------
step "2/5 检查 Node.js 环境"

if [ "$SKIP_FRONTEND" -eq 1 ]; then
  info "已跳过（--skip-frontend）"
else
  command -v node >/dev/null 2>&1 || die "未找到 node，请先安装 Node.js 20+：brew install node"
  command -v npm >/dev/null 2>&1 || die "未找到 npm，请重新安装 Node.js"
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  ok "Node.js $(node -v) / npm $(npm -v)"
  if [ "$NODE_MAJOR" -lt 20 ]; then
    warn "Node.js 版本偏低（当前 $NODE_MAJOR.x），Vite 8 需要 20.19+ / 22.12+，建议升级"
  fi
  if [ "$NODE_MAJOR" -lt 23 ]; then
    info "提示: 前端单测（node:test 直接跑 .ts）需要 Node.js 22.6+，make test 会自动加 --experimental-strip-types"
  fi
fi

# ---------- 3. 后端虚拟环境与依赖 ----------
step "3/5 安装后端依赖"

if [ "$SKIP_BACKEND" -eq 1 ]; then
  info "已跳过（--skip-backend）"
else
  if [ ! -x "$VENV_PY" ]; then
    info "创建虚拟环境 ${VENV_DIR}"
    "$PYTHON_BIN" -m venv "$VENV_DIR" \
      || die "创建虚拟环境失败，Debian/Ubuntu 请先执行: sudo apt-get install python3-venv"
  else
    info "复用已存在的虚拟环境 ${VENV_DIR}"
  fi
  ok "虚拟环境就绪"

  info "升级 pip / wheel"
  "$VENV_PY" -m pip install --upgrade pip wheel >/dev/null

  info "安装 requirements.txt（含 torch / transformers，首次约需数分钟）"
  "$VENV_PY" -m pip install -r "$BACKEND_DIR/requirements.txt"
  ok "后端依赖安装完成"

  if "$VENV_PY" - <<'PY'
import importlib.util

MODULES = ("fastapi", "uvicorn", "pydantic_settings", "multipart", "PIL", "rawpy",
           "numpy", "sklearn", "torch", "transformers", "huggingface_hub")
missing = [m for m in MODULES if importlib.util.find_spec(m) is None]
if missing:
    raise SystemExit("缺少模块: " + ", ".join(missing))
PY
  then
    ok "后端依赖自检通过"
  else
    warn "后端依赖自检未通过，请查看上方报错后重试"
  fi
fi

# ---------- 4. 前端依赖 ----------
step "4/5 安装前端依赖"

if [ "$SKIP_FRONTEND" -eq 1 ]; then
  info "已跳过（--skip-frontend）"
else
  info "npm install（${FRONTEND_DIR}）"
  (cd "$FRONTEND_DIR" && npm install --no-audit --no-fund)
  ok "前端依赖安装完成"
fi

# ---------- 5. 配置文件 + CLIP 模型 ----------
step "5/5 生成本地配置与 CLIP 模型"

mkdir -p "$DATA_DIR"
ok "数据目录 ${DATA_DIR}"

ENV_FILE="$BACKEND_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  info "已存在 ${ENV_FILE}，保留不覆盖（模板见 backend/.env.example）"
else
  cat > "$ENV_FILE" <<EOF
# photoSwitch 后端本地配置（由 setup.sh 生成，可随时修改）
# 全部配置项说明见 backend/.env.example

PHOTOSWITCH_DATA_DIR=$DATA_DIR
PHOTOSWITCH_CLIP_MODEL=$MODEL_DIR
PHOTOSWITCH_SIMILARITY_THRESHOLD=0.85

# 模型在线下载 / 运行时回退拉取使用的 Hugging Face 地址（国内镜像）
HF_ENDPOINT=${HF_ENDPOINT:-$DEFAULT_HF_ENDPOINT}
EOF
  ok "已生成 $ENV_FILE"
fi

MODEL_PRESENT=0
if [ -f "$MODEL_DIR/pytorch_model.bin" ] || [ -f "$MODEL_DIR/model.safetensors" ]; then
  MODEL_PRESENT=1
  WITH_MODEL="no"
  ok "CLIP 模型已存在：${MODEL_DIR}"
fi

if [ -z "$WITH_MODEL" ] && [ -t 0 ] && [ "$SKIP_BACKEND" -eq 0 ]; then
  printf '%s  ?%s 现在下载 CLIP 模型权重（约 600MB，相似照片分组必需）？[y/N] ' "$C_WARN" "$C_RESET"
  read -r answer || answer=""
  case "$answer" in
    y|Y|yes|YES) WITH_MODEL="yes" ;;
    *)           WITH_MODEL="no" ;;
  esac
fi
WITH_MODEL="${WITH_MODEL:-no}"

if [ "$WITH_MODEL" = "yes" ]; then
  if [ "$SKIP_BACKEND" -eq 1 ]; then
    warn "已跳过模型下载：--skip-backend 时没有可用的 Python 环境"
  else
    export HF_ENDPOINT="${HF_ENDPOINT:-$DEFAULT_HF_ENDPOINT}"
    info "从 ${HF_ENDPOINT} 下载 ${HF_REPO} → ${MODEL_DIR}"
    if "$VENV_PY" "$ROOT_DIR/scripts/download_clip_model.py" --repo "$HF_REPO" --target "$MODEL_DIR"; then
      MODEL_PRESENT=1
      ok "CLIP 模型就绪"
    else
      warn "CLIP 模型下载失败，相似照片分组暂不可用；网络就绪后重试: make model"
    fi
  fi
fi

if [ "$MODEL_PRESENT" -eq 0 ]; then
  warn "未安装 CLIP 模型：相似照片分组功能不可用（其余功能正常）"
  info "需要时执行: make model   或   ./setup.sh --with-model"
fi

# ---------- 完成 ----------
cat <<EOF

${C_BOLD}${C_OK}安装完成 🎉${C_RESET}

下一步：
  ${C_BOLD}make dev${C_RESET}          同时启动后端与前端（后台运行，日志在 .logs/）
  ${C_BOLD}make stop${C_RESET}         停止全部服务
  ${C_BOLD}make help${C_RESET}         查看全部可用命令

访问地址：
  前端  http://localhost:7003
  后端  http://localhost:7001/api/health
  接口文档  http://localhost:7001/docs

详细说明见 ${C_BOLD}README.md${C_RESET}
EOF
