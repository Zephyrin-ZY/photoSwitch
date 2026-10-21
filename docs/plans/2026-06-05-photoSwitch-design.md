# PhotoSwitch V1.0 设计文档

> 创建日期：2026-06-05
> 状态：设计完成，待实施

## 1. 产品概述

### 1.1 核心问题
旅行后产生 500-2000 张照片，其中有连拍、废片、随手拍和精心拍摄，人工逐张筛选效率极低。

### 1.2 解决方案
基于 AI 的照片快速筛选工具，通过相似照片分组 + 场景识别 + 两两对决交互，让用户高效地从海量照片中选出精品。

### 1.3 目标用户
单人使用，运行在个人 Mac mini 上，支持局域网内 pad 访问。

### 1.4 使用场景
- 电脑端为主力操作设备
- 平板端（iPad 等）局域网访问，兼容响应式布局

---

## 2. 核心功能

### 2.1 零拷贝照片索引
- 不上传、不复制照片文件，只建立索引
- 指定本地文件夹路径，后端扫描并建立文件索引
- 支持的图片格式：JPG、PNG、TIFF、WebP、HEIC，RAW（CR2、NEF、ARW、RAF、DNG 等）

### 2.2 文件身份识别（哈希索引）
- 以文件内容 MD5 哈希作为唯一身份标识
- 照片从 U 盘拷贝到硬盘后，哈希不变，已有分析结果可复用
- 外部硬盘挂载点变化不影响识别
- 文件索引结构：`哈希 → 原始路径 + 文件名 + 文件大小 + 修改时间`

### 2.3 AI 分析能力

**相似照片分组（CLIP）：**
- 模型：openai/clip-vit-base-patch32
- 提取 512 维图像特征向量
- 余弦相似度计算，阈值聚类分组
- 纯 CPU 可运行，不依赖 GPU

**场景识别分类（多模态大模型）：**
- 通过 Ollama API 调用本地多模态模型（如 Qwen2.5-VL-7B）
- 分类标签：风景、人物、美食、建筑、自拍、动物、交通工具、其他
- 同时可返回简要描述（用于搜索）

两个任务并行执行，互不阻塞。

### 2.4 分层缩略图

| 层级 | 长边尺寸 | 用途 |
|------|----------|------|
| 列表缩略图 | 400-600px | 卡片/列表浏览，批量加载 |
| 对比缩略图 | 1200px | 两两对决、分组对比 |
| 原图 | 原始尺寸 | 查看器按需加载 |

- 缩略图按内容哈希命名，存放在项目目录的 `thumbnails/` 下，删除项目时一并清理
- RAW 文件用 rawpy 提取内嵌预览图
- 大图用 Pillow 缩放生成
- 再次打开项目时已有缩略图直接复用

### 2.5 相似照片组 — 两两对决淘汰赛（Tournament Mode）

进入一个相似照片组后：
- 每次展示两张照片并排对比
- 默认是“先选择，再确认”，避免误操作：
  - 点击左图 / 按左箭头 = 选中左图
  - 点击右图 / 按右箭头 = 选中右图
  - 按 Enter = 确认当前选中照片胜出
  - 按 S / 星标键 = 标记当前选中照片收藏（继续参与对决）
  - 按 D = 当前两张都直接保留，不再参与后续对决
  - 按 Ctrl+Z = 撤销上一轮淘汰
- 按空格进入大图预览模式：
  - 左右箭头在 A / B 两张之间切换
  - Enter = 确认当前预览照片胜出
  - K = 当前预览照片直接晋级为保留，另一张继续参与后续淘汰赛
  - S = 标记当前预览照片收藏
  - Esc = 返回 PK 视图
- N 张照片需要 N-1 次对比选出冠军
- 淘汰赛实际只处理 `pending` 状态的照片；已保留、已淘汰的照片不会重新进入对决
- 最终胜出照片自动标记为 `keep`

### 2.6 独立照片 — 快速滑动模式

不属于任何相似组的独立照片：
- 电脑端：当前实现为网格进入原图查看，查看器中可快速切换与标记
  - 左右箭头 = 切换上一张 / 下一张
  - K = 保留
  - 下箭头 = 淘汰
  - 上箭头 = 收藏 / 取消收藏
- 平板端：左滑=淘汰，右滑=保留，上滑=收藏
- 卡片上显示缩略图 + 场景标签

### 2.7 照片状态管理

每张照片有三种主状态 + 一个独立收藏标记：
- `pending` — 待筛选（默认）
- `keep` — 保留
- `eliminate` — 淘汰
- `is_favorite` — 收藏（可叠加在 `pending` / `keep` 上，用于精选）

规则：
- 淘汰不删除原文件，只记录状态
- 淘汰区的照片可随时查看和恢复
- 支持撤销操作（Ctrl+Z）
- 可切换视图：全部 / 待筛选 / 保留 / 淘汰 / 收藏

### 2.8 原图查看器

- 点击任意照片进入全屏查看模式
- 触控板双指缩放 / 鼠标滚轮缩放
- 拖拽平移
- 显示 EXIF 信息（焦距、光圈、快门、ISO）
- 左右箭头键快速切换
- 查看模式下可直接标记保留/淘汰

### 2.9 筛选视图

支持按场景标签筛选：
- 全部 / 风景 / 人物 / 美食 / 建筑 ...
- 可与状态筛选组合（如：风景 + 待筛选）

### 2.10 导出

- 点击"导出" → 选择目标文件夹
- 将所有"保留"和"收藏"状态的照片拷贝到目标目录
- 导出选项：
  - 保持原始目录结构
  - 按场景分类建子文件夹
  - 仅导出收藏
- 导出前确认：共 X 张照片，预计占用 XX GB
- 导出过程显示进度，支持暂停

---

## 3. 技术架构

### 3.1 整体架构

```
┌─────────────────────────────────────────────┐
│  Browser (Desktop / Pad)                     │
│  React + Tailwind + Framer Motion            │
└──────────────────┬──────────────────────────┘
                   │ HTTP / WebSocket
┌──────────────────▼──────────────────────────┐
│  Backend (FastAPI)                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ 文件索引  │ │ CLIP分析  │ │ Ollama场景分类│ │
│  └──────────┘ └──────────┘ └──────────────┘ │
└──────────────────┬──────────────────────────┘
                   │
    ┌──────────────┼──────────────┐
    ▼              ▼              ▼
 本地文件系统   缩略图缓存     Ollama API
 (原文件不动)  (~/.photoswitch/) (localhost:11434)
```

### 3.2 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + TypeScript + Tailwind CSS + Framer Motion |
| 后端 | Python 3.11+ + FastAPI + uvicorn |
| AI - 相似分组 | CLIP (transformers) + numpy 余弦相似度 |
| AI - 场景分类 | Ollama API (本地多模态模型) |
| 图片处理 | Pillow + rawpy (RAW支持) |
| 部署 | Docker Compose |

### 3.3 项目目录结构

```
photoSwitch/
├── docs/
│   └── plans/
│       └── 2026-06-05-photoSwitch-design.md
├── frontend/                    # React 前端
│   ├── src/
│   │   ├── components/
│   │   │   ├── common/          # 通用组件（按钮、模态框等）
│   │   │   ├── upload/          # 文件夹选择组件
│   │   │   ├── gallery/         # 照片网格/列表视图
│   │   │   ├── tournament/      # 两两对决组件
│   │   │   ├── swipe/           # 左右滑动组件
│   │   │   ├── viewer/          # 原图查看器
│   │   │   └── export/          # 导出组件
│   │   ├── hooks/               # 自定义 hooks
│   │   ├── stores/              # 状态管理
│   │   ├── services/            # API 调用层
│   │   ├── types/               # TypeScript 类型定义
│   │   └── styles/              # 全局样式、主题
│   ├── public/
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
├── backend/                     # Python 后端
│   ├── app/
│   │   ├── api/                 # FastAPI 路由
│   │   │   ├── projects.py      # 项目管理接口
│   │   │   ├── photos.py        # 照片相关接口
│   │   │   ├── analysis.py      # AI 分析接口
│   │   │   └── export.py        # 导出接口
│   │   ├── core/                # 核心业务逻辑
│   │   │   ├── scanner.py       # 文件夹扫描 + 哈希计算
│   │   │   ├── indexer.py       # 文件索引管理
│   │   │   ├── thumbnail.py     # 缩略图生成
│   │   │   └── exporter.py      # 照片导出
│   │   ├── ai/                  # AI 模型集成
│   │   │   ├── clip_service.py  # CLIP 特征提取 + 聚类
│   │   │   └── ollama_service.py # Ollama 场景分类
│   │   ├── models/              # 数据模型
│   │   │   ├── project.py       # 项目数据结构
│   │   │   └── photo.py         # 照片数据结构
│   │   └── config.py            # 配置
│   ├── requirements.txt
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

### 3.4 数据存储

项目数据存在 `~/.photoswitch/projects/{project-id}/` 下：

```
~/.photoswitch/
├── projects/
│   └── {project-id}/
│       ├── project.json     # 项目元信息
│       ├── files.json       # 文件索引
│       ├── vectors.npy      # CLIP 特征向量
│       ├── clusters.json    # 聚类分组结果
│       ├── analysis.json    # 场景分析结果
│       └── thumbnails/
│           ├── {hash}_thumb.jpg     # 列表缩略图 (400-600px)
│           └── {hash}_medium.jpg    # 对比缩略图 (1200px)
```

**project.json 结构：**
```json
{
  "id": "uuid",
  "name": "京都旅行",
  "source_folders": ["/Volumes/SD卡/京都"],
  "created_at": "2026-06-05T10:00:00",
  "status": "analyzing | ready",
  "total_files": 1200
}
```

**files.json 结构：**
```json
{
  "files": [
    {
      "hash": "md5...",
      "filename": "IMG_0001.CR2",
      "original_path": "/Volumes/SD卡/京都/IMG_0001.CR2",
      "file_size": 25000000,
      "format": "CR2",
      "status": "pending",
      "scene_tags": ["风景"],
      "cluster_id": "cluster_003",
      "created_at": "2026:05:01 10:30:00"
    }
  ]
}
```

### 3.5 API 设计概要

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/projects | 创建项目，指定文件夹路径 |
| GET | /api/projects/{id} | 获取项目信息 |
| POST | /api/projects/{id}/scan | 扫描文件夹，建立索引 |
| POST | /api/projects/{id}/analyze | 启动 AI 分析 |
| GET | /api/projects/{id}/progress | 获取分析进度 (SSE) |
| GET | /api/projects/{id}/photos | 获取照片列表（支持分页、筛选） |
| PUT | /api/projects/{id}/photos/{hash}/status | 更新照片状态 |
| GET | /api/projects/{id}/clusters | 获取相似照片分组 |
| GET | /api/projects/{id}/clusters/{cluster_id} | 获取分组详情 |
| GET | /api/photos/{hash}/thumbnail?project_id={id} | 获取缩略图 |
| GET | /api/photos/{hash}/original | 获取原图 |
| POST | /api/projects/{id}/export | 导出照片 |
| GET | /api/projects/{id}/export/progress | 导出进度 (SSE) |

### 3.6 Docker Compose

```yaml
services:
  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    depends_on:
      - backend

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    volumes:
      - ~/.photoswitch:/data          # 项目数据
      - /Volumes:/volumes:ro          # 外部存储只读挂载
    environment:
      - OLLAMA_BASE_URL=http://host.docker.internal:11434
```

Ollama 作为外部服务运行在 Mac mini 上，后端通过 `host.docker.internal` 访问。

---

## 4. UI 设计方向

### 4.1 风格
- 科技风深色主题
- 主色调：深蓝/深灰背景 + 渐变高亮边框
- 毛玻璃（glassmorphism）效果卡片
- 流畅动画（Framer Motion）

### 4.2 响应式断点
- 桌面端：>= 1024px，多列网格布局
- 平板端：768px - 1023px，适配触控手势，两列布局
- 对决模式在平板端自动全屏

---

## 5. 迭代规划

### V1.0（当前）
- 零拷贝索引 + 哈希识别
- CLIP 相似分组 + Ollama 场景分类
- 两两对决淘汰赛
- 左右滑动快速筛选
- 原图查看器
- 按场景/状态筛选
- 导出功能
- 响应式布局

### V2.0（待定）
- 照片质量评分（曝光、构图）
- 自定义标签/备注
- 多项目管理
- 批量操作优化
- 分享功能（生成网页相册）
