# 会话记忆 2026-04-02

> 这是 2026-04-02 的历史会话快照，其中“礼乐课程系统”“礼乐编钟”等表述仅记录当时阶段；当前平台默认定位以“智慧AI教学平台 / 多主题课程平台”为准，礼乐只作为一门示例课程或既有课程内容出现。

## 1. 本轮用户核心诉求

用户要把这套礼乐课程系统彻底做成一体化系统，重点包括：

- 一个前端入口
- 一个数据库
- 一个后端内容中台
- 各角色体验统一
- 尽量不让学生、老师、管理员直接感知“真正后台”
- 只有运维相关能力作为管理端里的一个功能入口存在
- 管理员点击运维后台时复用当前登录态，不再二次登录

## 2. 本轮已经做完的内容

### 统一化改造

- 统一了前端入口和多角色入口体验。
- 管理端与 Directus 的衔接已打通。
- 运维后台入口可在管理端内进入，并复用管理员登录态。

### 首页改造

- 用户多次调整首页，当前方向以中式、礼乐、克制而高端为目标。
- 首页中间主标题采用“礼乐编钟·数智新生”。
- 左侧保留四个大卡片。
- 左上为红色“礼乐”印章样式。
- 右侧保留“路径化学习”卡片。
- 右侧为 5 颗不同颜色星星，使用直线路径连接，星星内仅保留四字短标签。
- “管理端”按钮改为紫色背景。

### 文案调整

用户对文案要求很高，明确反对：

- 空泛套话
- 过度口语化
- 不像真实教学产品的话术

更偏好：

- 稍微高端
- 但必须让普通人一眼看懂
- 不要直接写“面向老师”的口吻

### 多端视觉统一

- 学生端、教师端、管理端的登录页已统一风格。
- 三端进入后的门户页已统一风格。

### 管理端优化

- 用户管理页顶部不再显示“用户管理”大字。
- 内容管理页已补导航栏，并与用户管理页体验趋同。
- 内容管理页中的英文类型显示已翻译为中文。
- 内容管理右侧区域已简化，减少一屏内堆积的信息量。

### 图片绑定音频

- 已支持上传图片时绑定音频。
- 已支持给历史图片补绑音频。
- 教师课堂页点击图片可播放关联音频。

### 教师课堂页重做

- 已按用户要求重做教师端“开始上课”后的课堂页布局。
- 中间媒体区已调整为更明确的大画幅 `16:9` 播放区。
- 顶部课堂标题区已去除，不再占据主视觉空间。
- 底部控制按钮已整体下压，优先给媒体框让位。
- 左下角信息框已缩小，并改为仅保留两行：课程名称、模块名称。
- “课程已顺利完成”页面也已修正，顶部导航不会再次露出。
- 上述课堂页改动已完成构建并完成部署。

## 3. 用户明确表达过的设计判断

这些判断应视为后续继续工作的约束：

- 主页下方不应堆课程课时等运营信息。
- 首页不能有太多重复文字。
- 页面不能有“拼凑感”。
- 页面需要更大气、更贵、更有中式审美。
- 需要更多礼乐、编钟、曾侯乙相关视觉语言，但要克制。
- 右侧学习路径要整齐，不能凌乱。
- 左右内容块要严格对齐。
- 卡片文字不能太小，要更清晰。

## 4. 还可能继续被用户追改的点

- 首页视觉还会继续细抠。
- 首页文案还会继续逐条重写。
- 内容管理的复杂度仍可能继续被要求压缩。
- 教师课堂页的遮挡、间距和播放体验还可能继续调整。
- 多角色首页进入后的二级页面，还可能继续统一到和首页同一视觉水准。
- 教师课堂页的大媒体框仍可能继续被要求放大，左下和右下信息仍可能继续被要求压缩。
- 用户已开始推进三端统一 AIGC，后续很可能直接要求进入开发实现。

## 5. 本轮已经确认的关键实现点

### 图片点击播音频

相关核心文件：

- [ImageAudioPreview.tsx](/opt/course-platform/nextjs/components/media/ImageAudioPreview.tsx)
- [MediaPreview.tsx](/opt/course-platform/nextjs/components/media/MediaPreview.tsx)
- [route.ts](/opt/course-platform/nextjs/app/api/upload/route.ts)
- [route.ts](/opt/course-platform/nextjs/app/api/content/items/[itemId]/route.ts)
- [directus-admin.ts](/opt/course-platform/nextjs/lib/directus-admin.ts)

### 内容管理压缩

相关核心文件：

- [ContentManagementConsole.tsx](/opt/course-platform/nextjs/components/content/ContentManagementConsole.tsx)
- [ModuleItemsManager.tsx](/opt/course-platform/nextjs/components/content/ModuleItemsManager.tsx)

当前实现重点：

- 先选模块，再编辑
- 手动展开单元设置、课时设置
- 减少右侧默认全展开
- 压缩表单排布，降低横向溢出概率

### 统一门户外壳

相关核心文件：

- [PortalShell.tsx](/opt/course-platform/nextjs/components/portal/PortalShell.tsx)
- [LoginForm.tsx](/opt/course-platform/nextjs/components/LoginForm.tsx)

### 教师课堂页新布局

相关核心文件：

- [page.tsx](/opt/course-platform/nextjs/app/teacher/classroom/page.tsx)
- [MediaPreview.tsx](/opt/course-platform/nextjs/components/media/MediaPreview.tsx)
- [ImageAudioPreview.tsx](/opt/course-platform/nextjs/components/media/ImageAudioPreview.tsx)
- [AudioPlayer.tsx](/opt/course-platform/nextjs/components/media/AudioPlayer.tsx)
- [DocViewer.tsx](/opt/course-platform/nextjs/components/media/DocViewer.tsx)
- [PDFViewer.tsx](/opt/course-platform/nextjs/components/media/PDFViewer.tsx)

当前实现重点：

- 中间媒体区放大并固定为更强的 `16:9` 观感。
- 顶部标题区移除，主视觉集中到媒体区。
- 底部控制区下压，左下信息区缩小贴边。
- 完成态页面也保持课堂模式，不显示顶部导航。

### 三端统一 AIGC 方向

用户本轮已明确指定：

- 教师端、管理端都要增加 AIGC 能力。
- 三端都要增加：`AI辅助备课`、`AI生成图片`、`AI生成讲解词`、`AI生成视频`、`AI智能体`。
- 底层统一使用火山引擎 / 火山方舟 / 豆包模型，不再混用其他大模型平台。

当前建议的系统落点：

- 教师端入口：`/teacher`、`/teacher/prepare`
- 管理端入口：`/manage`、`/manage/content`、后续新增 `/manage/ai`
- 公共接口层：后续新增 `app/api/aigc/*`
- 公共服务层：后续新增 `lib/aigc/*` 与 `lib/ark/*`

## 6. 已验证过的命令

### 构建

```bash
cd /opt/course-platform/nextjs
npm run build
```

### 部署

```bash
cd /opt/course-platform
docker compose up -d --build nextjs
```

### 查看服务状态

```bash
cd /opt/course-platform
docker compose ps
```

## 7. 下次继续时建议的检查顺序

如果用户继续说“继续”“统一部署”“继续改首页”“继续改内容管理”，建议按这个顺序：

1. 先读 `HANDOFF.md`
2. 看用户这次要求属于首页、管理端、课堂播放还是统一登录
3. 打开对应页面文件和组件文件
4. 修改后先本地构建
5. 用户明确同意时再部署

## 8. 当前工作目录与结构提示

- 项目根目录：`/opt/course-platform`
- 前端目录：`/opt/course-platform/nextjs`
- Directus 目录：`/opt/course-platform/directus`
- Nginx 配置目录：`/opt/course-platform/nginx`
- SQL 目录：`/opt/course-platform/sql`

## 9. 备注

- 该项目当前不是 git 仓库。
- 不要假设可以用 git 追历史。
- 后续需要靠交接文档和文件现状继续工作。
- 用户本轮明确反对在 AIGC 需求上继续缩减范围，后续应按“三端都加、能力全加”的前提继续设计与实现。
