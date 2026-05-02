# OpenMAIC 集成课程平台规划

## 目标边界

将 OpenMAIC 作为课程平台的 AI 内容创作引擎深度集成到教师端与管理端，优先保障 PPT/课件、讲稿、互动游戏、项目协助、实操对话可用。课堂讨论、圆桌讨论、多智能体课堂辩论、学生端实时 AI 讨论暂不进入第一阶段产品入口，相关能力默认隐藏或不接入。

课程平台继续作为主系统，负责账号、角色、权限、课程结构、资源库、课堂运行、学生进度与审计。OpenMAIC 作为内网 AI 服务或嵌入式创作模块，负责生成与编辑能力。TTS 服务作为底层语音能力，通过统一代理被课程平台和 OpenMAIC 调用。

## 用户与服务边界

### 使用人员

- 管理员：管理 AI 服务配置、模型状态、教师 AI 权限、资源审核、小游戏发布。
- 教师：使用 AI 创作工坊生成课件、PPT、讲稿、小游戏、项目活动，并将成果挂入课程课件。
- 学生：只使用教师发布后的课件与小游戏，不直接接触 OpenMAIC 创作后台。

### 服务用户

- 课程平台 Next.js：继续由 systemd 运行，作为唯一公网业务入口。
- OpenMAIC：作为本机内网服务或库级能力运行，默认仅监听 `127.0.0.1`。
- TTS：Kokoro/MOSS 等仅监听本机端口，由课程平台代理调用。
- Directus/OnlyOffice/PostgreSQL/Redis：保持现有职责，不对 OpenMAIC 直接开放数据库写入。

## 总体技术原则

- 只开放 `80/443`，所有 AI/TTS/OpenMAIC 端口仅内网访问。
- 课程平台通过 API 调 OpenMAIC，不让 OpenMAIC 直接写课程库。
- AI 生成内容必须先进入草稿态，教师确认后再挂课件，必要时管理员审核。
- 生成小游戏必须走 miniapps 安全封装，限制外链、危险脚本、文件大小和运行沙箱。
- 教师 AI 能力使用现有 teacher capability 机制控制，不默认无限开放。
- 生成结果统一落到课程平台资源库、miniapps 或课件节点，避免散落在 OpenMAIC 私有目录。

## 阶段 0：现状盘点与安全基线

### 目标

确认 OpenMAIC、课程平台、miniapps、权限、TTS、OnlyOffice 的现有接口和可复用模块，形成最小可改动路径。

### 并行代理分工

- 代理 A：梳理 OpenMAIC 生成能力，输出 PPT、讲稿、大纲、画布、对话、导出、TTS 的路径与可复用 API。
- 代理 B：梳理课程平台 miniapps、课件挂载、教师备课、教师课堂、学生端运行链路。
- 代理 C：梳理课程平台认证、角色、教师能力、管理端入口和 AI 服务配置位置。
- 代理 D：检查部署、端口、systemd、Nginx、TTS 健康检查与安全暴露面。

### 交付物

- 集成规划文档。
- 第一阶段接口与页面清单。
- 风险清单：公网端口、脚本安全、权限绕过、资源写入、生成成本。

## 阶段 1：AI 创作工坊骨架

### 目标

在课程平台中建立 OpenMAIC 集成入口，不先追求完整生成效果，先跑通权限、页面、服务健康和任务类型选择。

### 并行代理分工

- 代理 A：实现教师端 `/teacher/ai-studio` 页面骨架，包含 PPT、讲稿、小游戏、项目协助、实操对话入口。
- 代理 B：实现管理端 `/manage/ai-services` 页面，展示 OpenMAIC、Kokoro、MOSS、OnlyOffice 状态。
- 代理 C：新增后端 API：`/api/openmaic/health`、`/api/openmaic/config`、`/api/openmaic/tasks` 的骨架。
- 代理 D：新增教师能力 `ai-course-builder`、`ai-game-builder`、`ai-voice-generator`，接入现有权限判断。

### 交付物

- 教师端 AI 创作工坊入口。
- 管理端 AI 服务状态页。
- API 健康检查。
- AI 权限控制基础。

## 阶段 2：优先功能一，AI 生成互动小游戏

### 目标

教师通过自然语言生成小游戏草稿，保存为课程平台 miniapp，并能挂到课件节点。

### 并行代理分工

- 代理 A：设计小游戏生成请求模型，包含课程、课时、教学目标、年级、玩法、素材约束。
- 代理 B：接 OpenMAIC 或本地生成器，输出标准 miniapp 包：`index.html`、资源、manifest、事件协议。
- 代理 C：实现 miniapp 安全校验与落盘，禁止危险外链、限制脚本、限制大小、生成沙箱 iframe 配置。
- 代理 D：实现教师备课页挂载小游戏到 lesson/module/item 的 UI 与 API。
- 代理 E：实现教师课堂端、学生端 miniapp 运行数据回传：开始、完成、得分、用时、错误题等。

### 交付物

- “生成小游戏”表单与对话。
- miniapp 草稿保存。
- 一键挂入课件节点。
- 教师课堂端可打开。
- 学生端可完成并回传数据。

## 阶段 3：PPT/课件生成与 OnlyOffice 预览

### 目标

教师基于课程/课时生成 PPT 或可编辑课件，保存为平台资源，支持预览、下载、挂课件。

### 并行代理分工

- 代理 A：接 OpenMAIC PPT/场景生成流程，统一输入课程上下文、课标、课时目标。
- 代理 B：实现生成结果转平台资源库，保存文件、元数据、来源任务、创建者。
- 代理 C：接 OnlyOffice 或现有媒体预览，实现 PPT 在线预览/编辑入口。
- 代理 D：实现 PPT 作为课件节点挂载，教师课堂端可播放。
- 代理 E：实现失败重试、任务状态、生成日志。

### 交付物

- PPT 生成任务。
- PPT 资源保存与预览。
- PPT 挂课件。
- 任务状态与错误反馈。

## 阶段 4：讲稿、逐页讲解词与 TTS

### 目标

为 PPT/课件页生成讲稿、教师提示词、课堂引导语，并可调用 Kokoro/MOSS 生成音频。

### 并行代理分工

- 代理 A：实现讲稿生成 API，支持按课时、按 PPT 页、按课堂模块生成。
- 代理 B：实现讲稿编辑与版本保存，绑定到课件节点。
- 代理 C：实现统一 TTS 代理，封装 Kokoro/MOSS 模型选择、音色、语速、输出格式。
- 代理 D：实现音频资源入库，并绑定课件页或小游戏旁白。
- 代理 E：实现批量生成、取消、重试和任务队列。

### 交付物

- 讲稿生成与编辑。
- 逐页讲解词。
- TTS 音频生成。
- 讲稿/音频与课件绑定。

## 阶段 5：项目协助与实操对话

### 目标

保留 OpenMAIC 的项目协助、实操讨论、创作对话能力，让教师围绕具体课程资源持续迭代。

### 并行代理分工

- 代理 A：实现课程上下文对话，把课程、课时、资源、学生年级作为上下文注入。
- 代理 B：实现对话生成动作：改写讲稿、生成游戏变体、补充活动、生成评价量规。
- 代理 C：实现对话历史保存与任务关联。
- 代理 D：实现从对话结果一键转资源、转 miniapp、转课件节点。
- 代理 E：隐藏课堂讨论/roundtable 类入口，避免教师误用为实时课堂讨论系统。

### 交付物

- 教师 AI 对话助手。
- 项目协助工作流。
- 对话结果转资源。
- OpenMAIC 讨论类能力隐藏。

## 阶段 6：治理、审核、配额与运维

### 目标

完善生产可用性：审核、日志、配额、模型配置、服务监控、失败告警。

### 并行代理分工

- 代理 A：实现管理员 AI 服务配置页，配置 OpenMAIC base URL、模型、TTS 默认项。
- 代理 B：实现教师/学校/班级维度配额，控制生成次数、TTS 时长、小游戏数量。
- 代理 C：实现资源审核流，尤其是 AI 生成小游戏与公开课件。
- 代理 D：实现调用日志、错误日志、任务耗时、模型状态。
- 代理 E：实现备份与迁移脚本，保障 AI 生成资源可恢复。

### 交付物

- AI 服务治理页。
- 权限与配额。
- 审核流。
- 调用日志与监控。

## 第一阶段立即实施范围

本轮先做最小可见闭环，不改动 OpenMAIC 生成核心：

1. 新增规划文档。
2. 新增教师端 AI 创作工坊页面入口。
3. 新增管理端 AI 服务状态页入口。
4. 新增 `/api/openmaic/health`，检查 Kokoro、MOSS，并为 OpenMAIC 服务预留状态。
5. 页面中明确展示第一优先级：小游戏、PPT、讲稿、项目协助、实操对话。
6. 页面中不展示课堂讨论/圆桌讨论。


## 代码盘点结论补充

### OpenMAIC 可复用能力

- 课件生成主入口：`/api/generate-classroom`，返回异步 `jobId`，再轮询 `/api/generate-classroom/{jobId}` 获取 `stage/scenes`。
- 课件数据模型：`Stage + Scene[]`，场景类型包括 `slide`、`quiz`、`interactive`、`pbl`。
- PPT/课件：`slide` 场景可渲染与导出 PPTX，导出逻辑在 OpenMAIC 的 `useExportPPTX()`。
- 讲稿：`actions` 中的 `speech` 可作为逐页讲稿和 TTS 输入，不需要接入 roundtable UI。
- 游戏/互动：`interactive` 场景支持 `widgetType='game'`，可输出 HTML，用课程平台 miniapps 承载。
- 项目协助：PBL 模块可映射为课程平台项目任务/实训任务，保留 PBL chat。
- 实操对话：OpenMAIC `/api/chat` 可作为教师 AI 助手，但固定 `sessionType='qa'`，不暴露 `discussion`。

### 课程平台 miniapps 现状

- 已有表：`mini_apps`、`mini_app_versions`、`content_miniapp_mounts`、`mini_app_events`。
- 已有运行链路：miniapp 挂到 `standard_module_item` 或 `teacher_resource` 后，教师课堂端和学生端通过 `MiniAppHost` iframe 运行。
- 最短闭环：AI 生成 HTML → 发布为 miniapp 版本 → 创建 `teacher_resources(item_type='miniapp')` → 写入 `teacher_resource` 挂载 → 教师课堂/学生端复用现有播放器。
- 管理端标准课件挂载可走 `module_items(item_type='miniapp')` + `content_miniapp_mounts(owner_kind='standard_module_item')`。

### 权限与治理结论

- 管理端 AI 服务治理只允许 admin。
- 教师端 AI 创作入口允许 teacher/admin，但后续生成 API 应接入教师 capability。
- 当前建议新增教师能力：`ai-lesson-generator`、`ai-game-builder`、`ai-voice-generator`。
- `/api/ai` 与 `/api/openmaic` 必须经过 middleware 鉴权，避免匿名调用模型服务。
- OpenMAIC 的 roundtable、discussion、multiAgent 入口在课程平台侧不暴露；导入 OpenMAIC 生成结果时忽略或清空 `scene.multiAgent`。

## 第一阶段实现记录：小游戏草稿生成

已新增教师侧最小闭环 API：`POST /api/teacher/miniapps/generate`。

当前实现先生成一个安全、离线、单文件 HTML 小游戏模板，发布为 miniapp 版本，并创建 `teacher_resources(item_type='miniapp')` 教师资源。它复用现有 miniapps 运行链路，因此后续可在备课页加入课堂编排，并在教师课堂端、学生端通过 `MiniAppHost` 运行。

当前 API 入参：

- `lessonId`：课时 ID。
- `moduleId`：模块 ID。
- `title`：小游戏标题。
- `prompt`：生成要求。
- `gradeLevel`：适用学段。
- `gameType`：`quiz`、`matching`、`sequence`。

后续升级方向：

- 将模板生成替换为 OpenMAIC `interactive/game` 生成结果。
- 对 AI 输出 HTML 做更严格的 sanitizer 与资源大小限制。
- 在教师备课页直接从当前 `lessonId/moduleId` 发起生成，不再手填 ID。
- 支持一键加入 `teacher_lesson_plan_items`，但需要避免覆盖教师已有课堂编排。

## 第二阶段实现记录：OpenMAIC 游戏生成优先

小游戏生成 API 已升级为“OpenMAIC 优先、本地模板回退”：

- 若配置 `OPENMAIC_BASE_URL`，平台会调用 `${OPENMAIC_BASE_URL}/api/generate/scene-content`。
- 请求使用 OpenMAIC `interactive` + `widgetType='game'` outline。
- 若 OpenMAIC 未配置、未启动、超时或未返回 HTML，则自动使用本地安全模板，保证教师侧闭环不中断。
- 对 OpenMAIC 返回 HTML 做基础安全清洗：移除外链脚本、iframe、object、embed、stylesheet link、内联事件属性、`javascript:` 与外部 URL。
- 清洗后注入 miniapp 事件桥，用于向课程平台回传 `start/complete` 等事件。
- API 返回 `generationSource` 与 `openMaicError`，前端会提示来源是 OpenMAIC 还是本地安全模板。

当前服务器还没有运行 OpenMAIC Web 服务，因此实际生成会走模板回退；启动 OpenMAIC 后只需配置 `OPENMAIC_BASE_URL` 指向本机内网地址即可切换。

## 模型配置能力实现记录

已新增每个管理员/教师可自主配置大模型的能力，统一按 OpenAI 协议填写：

- `Base URL`：例如 `https://openrouter.ai/api/v1`
- `API Key`：用户自己的密钥，仅后端保存，前端只显示脱敏预览
- `Model`：例如 `tencent/hy3-preview:free`
- `Provider Name`：配置显示名称

实现方式：

- 新增表 `ai_model_configs`，按 `auth_user_id` 保存每个用户自己的默认模型配置。
- 新增接口 `GET/POST /api/ai/model-config`。
- 教师端和管理端顶部都新增“配置大模型”按钮。
- 小游戏生成 API 会优先读取当前登录用户配置，并通过 OpenMAIC 请求头传递：`x-provider-type=openai`、`x-model=openai:{model}`、`x-api-key`、`x-base-url`。
- 若用户未配置，则继续使用 OpenMAIC 服务端默认模型配置。

## OpenMAIC 整体集成实现记录

已新增课程平台侧 OpenMAIC 代理层：

- `lib/openmaic-client.ts`：统一处理 OpenMAIC base URL、访问码 cookie、当前用户 OpenAI 协议模型配置请求头。
- `POST /api/openmaic/classroom/generate`：代理 OpenMAIC `/api/generate-classroom`，用于生成整课课件、PPT 场景、讲稿、互动内容。
- `GET /api/openmaic/classroom/jobs/[jobId]`：代理 OpenMAIC 任务轮询，并在返回结果中移除/隐藏 `multiAgent`、`generatedAgentConfigs`。
- 教师 AI 工坊新增“生成 PPT / 讲稿 / 互动课件”面板。

隐藏策略：

- 发起整课生成时固定 `agentMode='default'`，不启用生成多智能体课堂讨论角色。
- 返回课程平台前清理场景中的 `multiAgent` 字段。
- 返回课程平台前清理 stage 中的 `generatedAgentConfigs` 字段。
- UI 文案明确“讨论功能已隐藏”，仅暴露 PPT、讲稿、互动游戏、项目协助和实操对话相关生产能力。
