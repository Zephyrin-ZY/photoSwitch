# photoSwitch 常用命令入口
#
#   make help     查看全部目标
#   make setup    安装依赖
#   make dev      启动开发环境（后端 7001 + 前端 7003）
#
SHELL := /bin/bash
.DEFAULT_GOAL := help

ROOT          := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
VENV          := $(ROOT)/backend/.venv
VENV_PY       := $(VENV)/bin/python
LOG_DIR       := $(ROOT)/.logs
PID_DIR       := $(ROOT)/.run
DATA_DIR      := $(ROOT)/.data
MODEL_DIR     := $(ROOT)/backend/models/clip-vit-base-patch32
DOWNLOAD_PY   := $(ROOT)/scripts/download_clip_model.py

BACKEND_HOST  ?= 0.0.0.0
BACKEND_PORT  ?= 7001
FRONTEND_PORT ?= 7003
HF_REPO       ?= openai/clip-vit-base-patch32
# 国内镜像下载更快，可用 `HF_ENDPOINT=https://huggingface.co make model` 覆盖
HF_ENDPOINT   ?= https://hf-mirror.com

# 运行 .ts 单测：Node 23+ 原生支持类型剥离，22.x 需要显式开关
NODE_MAJOR := $(shell node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)
NODE_TS_FLAG := $(shell test "$(NODE_MAJOR)" -ge 23 2>/dev/null && echo "" || echo "--experimental-strip-types")

# 启动/忽略检查时跳过的目录
FIND_PRUNE := \( -path '*/node_modules' -o -path '*/.venv' -o -path '*/.git' -o -path '*/dist' \) -prune -o

# 端口占用预检：$(1)=端口，$(2)=可用环境变量名
define port_guard
	if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:$(1) -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "  ✗ 端口 $(1) 已被占用："; \
		lsof -nP -iTCP:$(1) -sTCP:LISTEN | tail -n +2 | cut -c1-90 | sed 's/^/      /'; \
		echo "    请先停掉该进程，或换端口重试，例如: $(2)=7011 make dev"; \
		exit 1; \
	fi
endef

.PHONY: help setup setup-with-model model dev backend frontend restart stop logs status \
        test lint build preview clean clean-build distclean doctor check-env check-venv \
        _start-backend _start-frontend _wait-backend

help: ## 显示全部可用命令
	@awk 'BEGIN {FS = ":.*##"; printf "\nphotoSwitch 命令一览（make <目标>）\n\n"} \
		/^[a-zA-Z_-]+:.*##/ {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""

# ---------------------------------------------------------------- 安装

setup: ## 安装后端 + 前端依赖（等价于 ./setup.sh）
	@$(ROOT)/setup.sh

setup-with-model: ## 安装依赖并下载 CLIP 模型（约 600MB）
	@$(ROOT)/setup.sh --with-model

model: check-venv ## 下载 CLIP 模型权重到 backend/models/
	@HF_ENDPOINT="$(HF_ENDPOINT)" $(VENV_PY) "$(DOWNLOAD_PY)" --repo "$(HF_REPO)" --target "$(MODEL_DIR)"

doctor: ## 自检运行环境（Python / Node / 依赖 / 模型 / 配置）
	@echo ""
	@command -v python3 >/dev/null 2>&1 && echo "  ✓ python3 $$(python3 -V 2>&1 | cut -d' ' -f2)" || echo "  ✗ 未找到 python3"
	@if [ -x "$(VENV_PY)" ]; then echo "  ✓ 虚拟环境 $(VENV)"; else echo "  ✗ 缺少虚拟环境，执行: make setup"; fi
	@command -v node >/dev/null 2>&1 && echo "  ✓ node $$(node -v)" || echo "  ✗ 未找到 node"
	@command -v npm >/dev/null 2>&1 && echo "  ✓ npm $$(npm -v)" || echo "  ✗ 未找到 npm"
	@[ -d "$(ROOT)/frontend/node_modules" ] && echo "  ✓ 前端依赖已安装" || echo "  ✗ 缺少前端依赖，执行: make setup"
	@if [ -f "$(MODEL_DIR)/pytorch_model.bin" ] || [ -f "$(MODEL_DIR)/model.safetensors" ]; then \
		echo "  ✓ CLIP 模型已就位"; \
	else \
		echo "  ! 缺少 CLIP 模型（相似分组不可用），执行: make model"; \
	fi
	@[ -f "$(ROOT)/backend/.env" ] && echo "  ✓ 后端配置 backend/.env" || echo "  ! 缺少 backend/.env，执行: make setup 或复制 backend/.env.example"
	@echo ""

# ---------------------------------------------------------------- 开发运行

dev: check-env ## 后台启动后端 + 前端（日志 .logs/，停止用 make stop）
	@mkdir -p "$(LOG_DIR)" "$(PID_DIR)" "$(DATA_DIR)/thumbnails"
	@$(MAKE) --no-print-directory _start-backend
	@$(MAKE) --no-print-directory _wait-backend
	@$(MAKE) --no-print-directory _start-frontend
	@$(MAKE) --no-print-directory status

backend: check-venv ## 前台启动后端（Ctrl+C 停止），默认端口 7001
	@cd "$(ROOT)/backend" && exec "$(VENV_PY)" -m uvicorn app.main:app \
		--host $(BACKEND_HOST) --port $(BACKEND_PORT) --reload

frontend: ## 前台启动前端开发服务器（Ctrl+C 停止），默认端口 7003
	@[ -d "$(ROOT)/frontend/node_modules" ] || { echo "  ✗ 缺少前端依赖，请先执行: make setup"; exit 1; }
	@cd "$(ROOT)/frontend" && VITE_API_PROXY_TARGET="$${VITE_API_PROXY_TARGET:-http://localhost:$(BACKEND_PORT)}" \
		exec npm run dev -- --host --port $(FRONTEND_PORT) --strictPort

restart: stop dev ## 重启 dev 启动的全部服务

stop: ## 停止 make dev 启动的后端与前端
	@mkdir -p "$(PID_DIR)"
	@for name in backend frontend; do \
		pidfile="$(PID_DIR)/$$name.pid"; \
		if [ -f "$$pidfile" ]; then \
			pid=$$(cat "$$pidfile"); \
			if kill -0 "$$pid" 2>/dev/null; then \
				pkill -TERM -P "$$pid" 2>/dev/null || true; \
				kill -TERM "$$pid" 2>/dev/null || true; \
				echo "  ✓ 已停止 $$name (pid $$pid)"; \
			else \
				echo "  · $$name 未在运行"; \
			fi; \
			rm -f "$$pidfile"; \
		else \
			echo "  · $$name 未在运行"; \
		fi; \
	done
	@sleep 1
	@if command -v lsof >/dev/null 2>&1; then \
		for port in $(BACKEND_PORT) $(FRONTEND_PORT); do \
			if lsof -nP -iTCP:$$port -sTCP:LISTEN >/dev/null 2>&1; then \
				echo "  ! 端口 $$port 仍被占用（不是 make dev 启动的进程，未自动终止）:"; \
				lsof -nP -iTCP:$$port -sTCP:LISTEN | tail -n +2 | cut -c1-100 | sed 's/^/      /'; \
			fi; \
		done; \
	fi

logs: ## 实时查看后端与前端日志（Ctrl+C 退出）
	@mkdir -p "$(LOG_DIR)"
	@touch "$(LOG_DIR)/backend.log" "$(LOG_DIR)/frontend.log"
	@tail -n 60 -f "$(LOG_DIR)/backend.log" "$(LOG_DIR)/frontend.log"

status: ## 查看服务运行状态
	@echo ""
	@for name in backend frontend; do \
		pidfile="$(PID_DIR)/$$name.pid"; \
		if [ -f "$$pidfile" ] && kill -0 "$$(cat "$$pidfile")" 2>/dev/null; then \
			echo "  ✓ $$name 运行中 (pid $$(cat "$$pidfile"))"; \
		else \
			echo "  · $$name 未运行"; \
		fi; \
	done
	@if command -v curl >/dev/null 2>&1; then \
		code=$$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://localhost:$(BACKEND_PORT)/api/health" 2>/dev/null || echo 000); \
		if [ "$$code" = "200" ]; then \
			echo "  ✓ 后端健康检查通过 → http://localhost:$(BACKEND_PORT)/api/health"; \
		else \
			echo "  ! 后端无响应 (HTTP $$code)，排查: make logs"; \
		fi; \
	fi
	@echo "  → 前端地址 http://localhost:$(FRONTEND_PORT)"
	@echo ""

# ---------------------------------------------------------------- 质量与构建

test: ## 运行前端单元测试（node:test）
	@test "$(NODE_MAJOR)" -ge 22 || { echo "  ✗ 运行 .ts 单测需要 Node.js 22.6+（当前 $(NODE_MAJOR).x）"; exit 1; }
	@cd "$(ROOT)/frontend" && node $(NODE_TS_FLAG) --test "tests/*.test.ts"

lint: ## 前端 ESLint 检查
	@cd "$(ROOT)/frontend" && npm run lint

build: ## 构建前端生产包（输出 frontend/dist）
	@[ -d "$(ROOT)/frontend/node_modules" ] || { echo "  ✗ 缺少前端依赖，请先执行: make setup"; exit 1; }
	@cd "$(ROOT)/frontend" && npm run build

preview: build ## 本地预览生产构建产物
	@cd "$(ROOT)/frontend" && npm run preview

# ---------------------------------------------------------------- 清理

clean: ## 清理缓存与运行产物（__pycache__、*.pyc、日志、PID）
	@find "$(ROOT)" $(FIND_PRUNE) -type d -name '__pycache__' -exec rm -rf {} + 2>/dev/null || true
	@find "$(ROOT)" $(FIND_PRUNE) -type f -name '*.py[cod]' -delete 2>/dev/null || true
	@rm -rf "$(ROOT)/.pytest_cache" "$(ROOT)/backend/.pytest_cache" \
		"$(ROOT)/.mypy_cache" "$(ROOT)/.ruff_cache" "$(ROOT)/backend/.ruff_cache"
	@rm -f "$(LOG_DIR)"/*.log "$(PID_DIR)"/*.pid 2>/dev/null || true
	@echo "  ✓ 缓存已清理（.data 项目数据与依赖均保留）"

clean-build: clean ## 清理缓存 + 前端构建产物 frontend/dist
	@rm -rf "$(ROOT)/frontend/dist"
	@echo "  ✓ 构建产物已清理"

distclean: clean-build ## 彻底清理：再删除 .venv 与 node_modules（保留 .data）
	@rm -rf "$(VENV)" "$(ROOT)/frontend/node_modules"
	@echo "  ✓ 已删除 backend/.venv 与 frontend/node_modules，重新安装请执行 make setup"

# ---------------------------------------------------------------- 内部目标

check-venv:
	@[ -x "$(VENV_PY)" ] || { echo "  ✗ 未找到后端虚拟环境 $(VENV)，请先执行: make setup"; exit 1; }

check-env: check-venv
	@[ -d "$(ROOT)/frontend/node_modules" ] || { echo "  ✗ 未找到前端依赖，请先执行: make setup"; exit 1; }
	@command -v node >/dev/null 2>&1 || { echo "  ✗ 未找到 node，请先安装 Node.js 20+"; exit 1; }
	@[ -f "$(ROOT)/backend/.env" ] || echo "  ! 提示: 缺少 backend/.env，数据目录将使用默认值 /data（可能不可写），建议执行 make setup"

_start-backend:
	@if [ -f "$(PID_DIR)/backend.pid" ] && kill -0 "$$(cat "$(PID_DIR)/backend.pid")" 2>/dev/null; then \
		echo "  · 后端已在运行 (pid $$(cat "$(PID_DIR)/backend.pid"))"; \
		exit 0; \
	fi; \
	$(call port_guard,$(BACKEND_PORT),BACKEND_PORT); \
	echo "  · 启动后端 → http://localhost:$(BACKEND_PORT) （日志 .logs/backend.log）"; \
	nohup "$(VENV_PY)" -m uvicorn app.main:app --app-dir backend \
		--host $(BACKEND_HOST) --port $(BACKEND_PORT) \
		--reload --reload-dir backend/app \
		> "$(LOG_DIR)/backend.log" 2>&1 & \
	echo $$! > "$(PID_DIR)/backend.pid"; \
	sleep 2; \
	if ! kill -0 "$$(cat "$(PID_DIR)/backend.pid")" 2>/dev/null; then \
		echo "  ✗ 后端启动失败，日志末尾："; \
		tail -n 20 "$(LOG_DIR)/backend.log" | sed 's/^/      /'; \
		rm -f "$(PID_DIR)/backend.pid"; \
		exit 1; \
	fi

_wait-backend:
	@command -v curl >/dev/null 2>&1 || exit 0; \
	for i in $$(seq 1 30); do \
		code=$$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "http://localhost:$(BACKEND_PORT)/api/health" 2>/dev/null || echo 000); \
		if [ "$$code" = "200" ]; then echo "  ✓ 后端已就绪"; exit 0; fi; \
		sleep 1; \
	done; \
	echo "  ! 后端 30 秒内未就绪，请查看 .logs/backend.log"

_start-frontend:
	@if [ -f "$(PID_DIR)/frontend.pid" ] && kill -0 "$$(cat "$(PID_DIR)/frontend.pid")" 2>/dev/null; then \
		echo "  · 前端已在运行 (pid $$(cat "$(PID_DIR)/frontend.pid"))"; \
		exit 0; \
	fi; \
	$(call port_guard,$(FRONTEND_PORT),FRONTEND_PORT); \
	echo "  · 启动前端 → http://localhost:$(FRONTEND_PORT) （日志 .logs/frontend.log）"; \
	cd "$(ROOT)/frontend"; \
	VITE_API_PROXY_TARGET="$${VITE_API_PROXY_TARGET:-http://localhost:$(BACKEND_PORT)}" \
	nohup ./node_modules/.bin/vite --host --port $(FRONTEND_PORT) --strictPort \
		> "$(LOG_DIR)/frontend.log" 2>&1 & \
	echo $$! > "$(PID_DIR)/frontend.pid"; \
	sleep 3; \
	if ! kill -0 "$$(cat "$(PID_DIR)/frontend.pid")" 2>/dev/null; then \
		echo "  ✗ 前端启动失败，日志末尾："; \
		tail -n 20 "$(LOG_DIR)/frontend.log" | sed 's/^/      /'; \
		rm -f "$(PID_DIR)/frontend.pid"; \
		exit 1; \
	fi
