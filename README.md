# photoSwitch

旅行照片快速筛选工具 —— 用 CLIP 视觉模型把上千张旅行照片自动分成"相似组"，通过两两对决快速淘汰废片，最后一键导出精选照片。

拍完一趟旅行回来，500~2000 张照片里混着连拍、糊片、随手拍和真正想留的作品。逐张翻看太慢，photoSwitch 的思路是：**先让 AI 把长得像的照片聚到一起，你只需要在每组里选出最好的那张**。

- 零拷贝：不上传、不复制照片，只对本地文件夹建立索引
- 纯 CPU 可跑：CLIP 特征提取不依赖 GPU
- 局域网可用：前端监听 `0.0.0.0`，iPad / 手机可访问 Mac 上的服务

---

## 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [手动安装](#手动安装)
- [CLIP 模型](#clip-模型)
- [配置说明](#配置说明)
- [常用命令](#常用命令)
- [使用流程](#使用流程)
- [Docker 部署](#docker-部署)
- [项目结构](#项目结构)
- [常见问题](#常见问题)
- [License](#license)

---

## 功能特性

| 能力 | 说明 |
| --- | --- |
| 文件夹索引 | 指定一个或多个本地文件夹，扫描支持的图片格式，按文件内容 MD5 建立身份索引 |
| 相似照片分组 | CLIP（`openai/clip-vit-base-patch32`）提取 512 维特征 → 余弦相似度 → 层次聚类，阈值可调 |
| 分层缩略图 | 列表缩略图 600px、对比缩略图 1200px、原图按需加载；缩略图随项目存储，删除项目时一并清理 |
| RAW 支持 | CR2 / NEF / ARW / RAF / DNG / ORF / RW2，用 rawpy 提取内嵌预览图 |
| 两两对决 | 组内照片逐张 PK，胜者留下、败者淘汰，比逐张打分快得多 |
| 状态管理 | 待筛选 / 保留 / 淘汰 / 收藏，支持撤销，筛选进度落盘可中断续做 |
| 导出 | 把保留或收藏的照片复制到目标文件夹，可选只导收藏、可选按 EXIF 方向纠正 |

支持的图片格式：`jpg / jpeg / png / tiff / tif / webp / heic / cr2 / nef / arw / raf / dng / orf / rw2`

## 技术栈

- **后端**：Python + FastAPI + Uvicorn，Pydantic Settings 管理配置
- **AI**：transformers + PyTorch（CLIP）、scikit-learn（AgglomerativeClustering）、Pillow、rawpy、NumPy
- **前端**：React 19 + TypeScript + Vite 8 + Tailwind CSS 4 + Zustand + Framer Motion
- **测试**：前端使用 Node 内置 `node:test`（`frontend/tests/*.test.ts`）
- **部署**：本地进程（推荐开发）或 Docker Compose（后端 + Nginx）

## 环境要求

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| 操作系统 | macOS / Linux | Windows 建议用 WSL2；脚本按 macOS 优先适配 |
| Python | 3.9+，推荐 3.10 以上 | `requirements.txt` 已为 3.9 适配 numpy / scikit-learn 版本；`setup.sh` 会自动挑选可用的新解释器 |
| Node.js | 20.19+ / 22.12+（Vite 8 要求） | 运行前端单测需要 22.6+（直接执行 `.ts`） |
| npm | 10+ | 随 Node.js 安装 |
| make | 任意 | macOS 装 Xcode Command Line Tools 后自带 |
| 磁盘空间 | 约 3GB | 依赖约 2GB（含 PyTorch）+ CLIP 模型约 600MB |

macOS 快速检查：

```bash
python3 -V && node -v && npm -v && make -v | head -1
```

---

## 快速开始

```bash
git clone <你的仓库地址> photoSwitch
cd photoSwitch

./setup.sh        # 一键安装：创建 venv、装后端依赖、npm install、生成 backend/.env
make dev          # 后台启动后端(7001) + 前端(7003)
```

打开浏览器访问 **http://localhost:7003** 即可使用。

```bash
make stop         # 停止全部服务
make help         # 查看全部可用命令
make doctor       # 环境自检（Python / Node / 依赖 / 模型 / 配置）
```

想一次把 CLIP 模型也下好（约 600MB，相似分组必需）：

```bash
./setup.sh --with-model
# 或
make setup && make model
```

> `make dev` 的日志在 `.logs/backend.log` 与 `.logs/frontend.log`，实时查看用 `make logs`。
> 端口被占用时脚本会直接报错并提示占用进程，不会静默换端口；换端口用 `BACKEND_PORT=7011 FRONTEND_PORT=7013 make dev`（此时前端代理会自动指向新的后端端口）。

---

## 手动安装

不想用 `setup.sh` 的话，按下面四步来。

### 1. 后端

```bash
cd backend
python3.12 -m venv .venv                 # 或 python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt          # 含 torch，首次约需数分钟

cp .env.example .env                     # 然后把里面的路径改成你机器上的绝对路径
```

`backend/.env` 最关键的两项：

```ini
PHOTOSWITCH_DATA_DIR=/绝对路径/photoSwitch/.data
PHOTOSWITCH_CLIP_MODEL=/绝对路径/photoSwitch/backend/models/clip-vit-base-patch32
```

> 不配 `.env` 时 `PHOTOSWITCH_DATA_DIR` 默认是 Docker 用的 `/data`，本地通常不可写，会导致创建项目失败。

### 2. 前端

```bash
cd frontend
npm install
cp .env.example .env      # 可选，默认值已能连上 localhost:7001
```

### 3. 启动（两个终端）

```bash
# 终端 A —— 后端
cd backend && source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 7001 --reload

# 终端 B —— 前端
cd frontend
npm run dev
```

### 4. 验证

```bash
curl http://localhost:7001/api/health     # {"status":"ok"}
open http://localhost:7001/docs           # FastAPI 接口文档
open http://localhost:7003                # 前端界面
```

---

## CLIP 模型

相似照片分组依赖 `openai/clip-vit-base-patch32`。权重文件约 600MB（完整仓库 3.4GB，含用不到的 TensorFlow / Flax 权重），因此**没有提交到 Git**（`backend/models/` 已在 `.gitignore` 中），需要单独获取，三选一：

**方式一：项目脚本（推荐，只下必需文件）**

```bash
make model
# 使用官方源而不是镜像：
HF_ENDPOINT=https://huggingface.co make model
```

**方式二：huggingface-cli**

```bash
pip install -U "huggingface_hub[cli]"
export HF_ENDPOINT=https://hf-mirror.com     # 国内网络建议
huggingface-cli download openai/clip-vit-base-patch32 \
  --local-dir backend/models/clip-vit-base-patch32
```

**方式三：手动下载**

从 https://huggingface.co/openai/clip-vit-base-patch32/tree/main 下载以下文件放进 `backend/models/clip-vit-base-patch32/`：

```
config.json  preprocessor_config.json  tokenizer.json  tokenizer_config.json
vocab.json   merges.txt  special_tokens_map.json  pytorch_model.bin
```

### 没有模型会怎样

不会崩，只是**相似分组功能不可用**：扫描、缩略图、手动筛选（保留 / 淘汰 / 收藏）、导出都正常工作，点"开始分析"时进度接口会返回 `CLIP feature extraction failed`。

`PHOTOSWITCH_CLIP_MODEL` 也可以直接填 Hugging Face 仓库 id（如 `openai/clip-vit-base-patch32`），此时首次分析会在线拉取权重；本地目录不存在时同样会自动回退到在线拉取。国内网络建议同时在 `.env` 里设置 `HF_ENDPOINT=https://hf-mirror.com`。

---

## 配置说明

### 后端 `backend/.env`

模板见 [`backend/.env.example`](backend/.env.example)。所有配置项都是 `PHOTOSWITCH_` 前缀的环境变量，定义在 [`backend/app/config.py`](backend/app/config.py)；**真实环境变量优先级高于 `.env` 文件**，`.env` 不会被提交。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PHOTOSWITCH_DATA_DIR` | `/data` | 项目索引、缩略图、聚类向量、进度文件存放目录（本地务必改成可写路径） |
| `PHOTOSWITCH_CLIP_MODEL` | `/app/models/clip-vit-base-patch32` | 本地模型目录，或 Hugging Face 仓库 id |
| `PHOTOSWITCH_SIMILARITY_THRESHOLD` | `0.85` | 分组阈值，越大分组越严格；创建项目时可单独覆盖 |
| `PHOTOSWITCH_THUMBNAIL_SIZE` | `[600,600]` | 列表缩略图尺寸，需写成 JSON 数组 |
| `PHOTOSWITCH_MEDIUM_THUMBNAIL_SIZE` | `[1200,1200]` | 对比缩略图尺寸 |
| `PHOTOSWITCH_SUPPORTED_FORMATS` | 见 config.py | 允许索引的扩展名，JSON 数组 |
| `PHOTOSWITCH_APP_NAME` | `PhotoSwitch` | 应用名 |
| `HF_ENDPOINT` | 官方源 | 无前缀，由 huggingface_hub 读取；国内填 `https://hf-mirror.com` |

### 前端 `frontend/.env`

模板见 [`frontend/.env.example`](frontend/.env.example)。前端请求统一走相对路径 `/api`，由 Vite 开发服务器代理转发，因此不存在跨域问题。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_API_PROXY_TARGET` | `http://localhost:7001` | 开发服务器 `/api` 的代理目标 |
| `VITE_API_BASE_URL` | `http://localhost:7001` | 未设置 `VITE_API_PROXY_TARGET` 时的兜底值 |

改完 `.env` 需要重启前端（`make restart` 或重新 `make frontend`）才生效。

---

## 常用命令

`make help` 可随时查看，主要有：

| 命令 | 作用 |
| --- | --- |
| `make setup` | 安装后端 + 前端依赖（等价于 `./setup.sh`） |
| `make setup-with-model` | 安装依赖并下载 CLIP 模型 |
| `make model` | 仅下载 CLIP 模型权重 |
| `make dev` | 后台启动后端 + 前端，附带健康检查 |
| `make backend` | 前台只启动后端（Ctrl+C 停止），默认 7001 |
| `make frontend` | 前台只启动前端（Ctrl+C 停止），默认 7003 |
| `make stop` | 停止 `make dev` 启动的服务 |
| `make restart` | 重启 dev 服务 |
| `make status` | 查看运行状态 + 后端健康检查 |
| `make logs` | 实时查看后端 / 前端日志 |
| `make test` | 运行前端单元测试（`node:test`） |
| `make lint` | 前端 ESLint 检查 |
| `make build` | 构建前端生产包到 `frontend/dist` |
| `make preview` | 构建并本地预览生产包 |
| `make doctor` | 环境自检 |
| `make clean` | 清理 `__pycache__` / `*.pyc` / 日志（保留依赖与 `.data`） |
| `make clean-build` | 上面这些 + 删除 `frontend/dist` |
| `make distclean` | 再删除 `backend/.venv` 与 `frontend/node_modules` |

`setup.sh` 的常用参数：

```bash
./setup.sh --with-model       # 顺便下载 CLIP 模型
./setup.sh --skip-model       # 不下载模型
./setup.sh --skip-frontend    # 只装后端
./setup.sh --python python3.12  # 指定解释器（也可用环境变量 PYTHON=）
./setup.sh --data-dir ~/photoswitch-data  # 指定数据目录
./setup.sh --help
```

`make dev` 与 `setup.sh` 都是幂等的：重复执行不会重复启动服务、不会覆盖已有的 `backend/.env`、已下载的模型会跳过。

---

## 使用流程

1. **新建项目**：填写项目名，选择一个或多个照片所在文件夹，设置相似度阈值（默认 0.85）
2. **扫描**：后端递归扫描并建立索引（零拷贝，只记录路径 + 哈希 + 元信息）
3. **AI 分析**：并行生成缩略图 → CLIP 提取特征 → 聚类分组，界面实时显示两个阶段的进度
4. **筛选**：
   - 分组视图：一组相似照片里挑出最好的
   - 两两对决：组内照片逐张 PK，胜者留下
   - 状态切换：保留 / 淘汰 / 收藏，可随时撤销
   - 顶部标签按 全部 / 待筛选 / 保留 / 淘汰 / 收藏 过滤
5. **导出**：选择目标文件夹，可只导出收藏、可选择按 EXIF 方向纠正后导出

分析结果与筛选进度都会落盘，中途关掉浏览器或重启服务都能接着做。

---

## Docker 部署

适合长期挂在一台机器上（例如 Mac mini）给局域网内多设备访问。

```bash
# 生产：后端 7001 + Nginx 托管前端 7003
docker compose up -d --build

# 开发：代码热重载
docker compose -f docker-compose.dev.yml up -d --build
```

注意事项：

- **CLIP 模型需要挂载进容器**。编辑 `docker-compose.yml`（或 `docker-compose.dev.yml`）里 backend 的 volumes，把宿主机模型目录指向 `/app/models/clip-vit-base-patch32`：

  ```yaml
  volumes:
    - /你的路径/clip-vit-base-patch32:/app/models/clip-vit-base-patch32:ro
  ```

- **照片目录也要挂载**，容器里才能读到你的照片。默认 compose 文件已把 `/Volumes` 与 `/Users` 以只读方式挂进去，其他系统请按需调整。
- 容器内数据目录是 `PHOTOSWITCH_DATA_DIR=/data`，由命名卷 `photoswitch-data` 持久化。
- 前端容器用 Nginx 把 `/api/` 反代到 `host.docker.internal:7001`（见 `frontend/nginx.conf`）。
- 访问地址：http://localhost:7003 ，局域网设备用 `http://<宿主机IP>:7003`。

停止：`docker compose down`（加 `-v` 会同时删除数据卷，慎用）。

---

## 项目结构

```
photoSwitch/
├── setup.sh                     # 一键安装脚本（venv + 依赖 + .env + 可选模型）
├── Makefile                     # 常用命令入口，make help 查看
├── scripts/
│   └── download_clip_model.py   # 只下载 CLIP 推理必需文件
├── backend/
│   ├── requirements.txt
│   ├── .env.example             # 后端配置模板（复制为 .env 使用）
│   ├── Dockerfile / Dockerfile.dev
│   ├── models/                  # CLIP 权重（gitignore，需自行下载）
│   └── app/
│       ├── main.py              # FastAPI 入口，/api/health
│       ├── config.py            # 全部配置项与默认值
│       ├── api/                 # projects / photos / analysis / export 路由
│       ├── ai/clip_service.py   # CLIP 特征提取 + 相似度聚类
│       ├── core/                # scanner / indexer / thumbnail / exporter
│       └── models/              # Pydantic 数据模型
├── frontend/
│   ├── package.json / vite.config.ts
│   ├── .env.example             # 前端配置模板
│   ├── nginx.conf               # 生产环境反向代理
│   ├── src/
│   │   ├── pages/               # Home / ProjectPage / FilterPage / TestPage
│   │   ├── components/          # Tournament / PhotoViewer / ExportPanel / DirectoryPicker ...
│   │   ├── stores/              # Zustand 状态
│   │   ├── services/api.ts      # 统一走 /api
│   │   └── utils/               # 筛选、进度、对决文案等纯函数（含单测覆盖）
│   └── tests/                   # node:test 单元测试
├── docs/plans/                  # 设计文档
├── docker-compose.yml           # 生产编排
└── docker-compose.dev.yml       # 开发编排（热重载）
```

运行期生成、不提交 Git 的目录：`backend/.venv`、`.data`（项目数据）、`.logs`（服务日志）、`.run`（PID 文件）、`frontend/node_modules`、`frontend/dist`。

---

## 常见问题

**端口 7001 / 7003 被占用**

`make dev` 会直接报错并列出占用进程。确认可以停掉就 `kill <PID>`，或者换端口：

```bash
BACKEND_PORT=7011 FRONTEND_PORT=7013 make dev
BACKEND_PORT=7011 FRONTEND_PORT=7013 make stop
```

用 `make` 启动时，前端代理目标会自动跟随 `BACKEND_PORT`；若是手动 `npm run dev`，则需要在 `frontend/.env` 里同步修改 `VITE_API_PROXY_TARGET`。

**`make dev` 起来了，但界面请求失败**

先看 `make logs`。最常见原因是后端没读到 `.env`，数据目录还是 `/data` 导致写不进去 —— 执行 `make doctor` 检查 `backend/.env` 是否存在，路径是否为绝对路径。

**pip 安装 rawpy 失败**

rawpy 需要 libraw。macOS：`brew install libraw`；Ubuntu/Debian：`sudo apt-get install libraw-dev`，然后重跑 `make setup`。

**HEIC 照片显示不出来**

Pillow 默认不解码 HEIC，可选安装：`backend/.venv/bin/pip install pillow-heif`。其余格式不受影响。

**CLIP 下载很慢或超时**

用镜像：`HF_ENDPOINT=https://hf-mirror.com make model`。下载脚本只拉取 PyTorch 推理必需的文件（约 600MB），比完整仓库省 1.2GB 以上。

**分析卡在缩略图阶段**

大尺寸 RAW 首次生成缩略图较慢，进度条会持续推进；缩略图存放在 `.data/projects/<项目ID>/thumbnails`，同一项目内重复分析会直接复用，删除项目时会随项目目录一起删除。

**Python 3.9 能装吗**

可以，`requirements.txt` 用环境标记为 3.9 选择了兼容的 numpy / scikit-learn 版本。不过 `setup.sh` 默认会优先挑选 3.10+ 的解释器，条件允许建议用 3.12。

**想用 iPad / 手机访问**

前端监听 `0.0.0.0`，同一局域网内访问 `http://<Mac的IP>:7003` 即可（`make dev` 启动后，`.logs/frontend.log` 里会打印 Network 地址）。

**代码改了要重启吗**

不用。`make dev` 启动的后端带 `--reload`（监听 `backend/app`），前端是 Vite HMR，保存即生效。

---

## License

暂未指定开源许可证，保留所有权利。后续确定后再补充本章节与 `LICENSE` 文件。
