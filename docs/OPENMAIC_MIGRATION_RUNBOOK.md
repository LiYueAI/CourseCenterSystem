# OpenMAIC 迁移运行手册

本文档用于课程平台集成 OpenMAIC 后的生产迁移、部署、核验、回滚和重启恢复。默认目标是无 Docker 宿主机部署：所有服务由本机二进制、Node.js、Python/AI 服务进程、systemd、Nginx、PostgreSQL/Redis 等直接托管，不依赖 Docker 或 docker compose。

## 适用范围与原则

- 仅开放公网 `80/443`，OpenMAIC、MiniMax、火山、视频生成、TTS、数据库、Redis 等端口不得直接暴露到公网。
- 课程平台 Next.js 作为唯一公网业务入口，OpenMAIC/TTS/视频等能力通过本机或内网 API 被后端代理调用。
- 所有密钥只在环境变量、systemd EnvironmentFile、密钥管理系统或服务器安全目录中核验是否存在，不在终端、日志、截图或文档中展示明文。
- 迁移前必须完成数据库、上传资源、环境配置、Nginx/systemd 配置备份。
- 迁移、构建、重启、回滚均应保留操作记录和时间点，便于多代理协作时定位变更。

## 变量约定

按实际环境替换以下变量：

```bash
APP_DIR=/opt/course-platform
APP_USER=ubuntu
APP_SERVICE=course-platform
APP_PORT=3000
DOMAIN=example.com
DB_NAME=course_platform
DB_USER=course_platform
BACKUP_ROOT=/opt/backups/course-platform
RELEASE_TS=$(date +%Y%m%d-%H%M%S)
```

常见路径约定：

- 应用目录：`/opt/course-platform`
- 文档目录：`/opt/course-platform/docs`
- systemd 服务：`/etc/systemd/system/course-platform.service`
- 生产环境变量：`/opt/course-platform/.env.production` 或 systemd `EnvironmentFile`
- Nginx 站点：`/etc/nginx/sites-available/course-platform` 与 `/etc/nginx/sites-enabled/course-platform`
- 备份目录：`/opt/backups/course-platform/<timestamp>`

## 迁移前检查

### 主机与端口

```bash
hostnamectl
node -v
npm -v
psql --version
nginx -v
systemctl status course-platform --no-pager
ss -lntp
```

确认：

- 宿主机没有依赖 Docker 运行当前业务。
- `course-platform` 服务由 systemd 管理。
- 本机业务端口如 `3000` 仅监听 `127.0.0.1` 或内网地址。
- 公网入口只应通过 Nginx 暴露 `80/443`。

### 工作区保护

你不是唯一在代码库工作。迁移前只做确认，不要回滚他人修改：

```bash
cd /opt/course-platform
git status --short
```

如存在他人未提交修改，记录文件列表并避免覆盖；迁移文档、脚本和配置变更应按最小范围执行。

## 迁移前备份

### 创建备份目录

```bash
sudo mkdir -p "$BACKUP_ROOT/$RELEASE_TS"
sudo chown -R "$APP_USER:$APP_USER" "$BACKUP_ROOT"
```

### 数据库备份

```bash
pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc -f "$BACKUP_ROOT/$RELEASE_TS/db.dump"
pg_dump -U "$DB_USER" -d "$DB_NAME" --schema-only -f "$BACKUP_ROOT/$RELEASE_TS/schema.sql"
```

校验备份可读：

```bash
pg_restore -l "$BACKUP_ROOT/$RELEASE_TS/db.dump" | head
```

### 文件与资源备份

按实际资源目录调整：

```bash
cd "$APP_DIR"
tar -czf "$BACKUP_ROOT/$RELEASE_TS/uploads.tar.gz" uploads public/uploads storage 2>/dev/null || true
tar -czf "$BACKUP_ROOT/$RELEASE_TS/public-assets.tar.gz" public 2>/dev/null || true
```

### 配置备份

```bash
sudo cp -a /etc/systemd/system/course-platform.service "$BACKUP_ROOT/$RELEASE_TS/" 2>/dev/null || true
sudo cp -a /etc/nginx/sites-available/course-platform "$BACKUP_ROOT/$RELEASE_TS/" 2>/dev/null || true
sudo cp -a /etc/nginx/sites-enabled/course-platform "$BACKUP_ROOT/$RELEASE_TS/course-platform.enabled" 2>/dev/null || true
cp -a "$APP_DIR/.env.production" "$BACKUP_ROOT/$RELEASE_TS/.env.production" 2>/dev/null || true
```

保护备份中的密钥文件：

```bash
chmod 600 "$BACKUP_ROOT/$RELEASE_TS/.env.production" 2>/dev/null || true
```

### 代码版本记录

```bash
cd "$APP_DIR"
git rev-parse HEAD > "$BACKUP_ROOT/$RELEASE_TS/git-head.txt"
git status --short > "$BACKUP_ROOT/$RELEASE_TS/git-status.txt"
```

## 执行 SQL 迁移

### 预检迁移文件

```bash
cd "$APP_DIR"
find . -maxdepth 4 -type f \( -path '*migration*' -o -path '*migrations*' -o -name '*.sql' \) | sort
```

确认迁移文件顺序、目标数据库、是否包含破坏性 DDL。对 `DROP`、`TRUNCATE`、大表 `ALTER TABLE`、索引重建等操作，应评估锁表时间并选择低峰窗口。

### 应用 SQL 文件

如项目使用原生 SQL 迁移：

```bash
cd "$APP_DIR"
psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f path/to/migration.sql
```

如项目使用框架迁移命令，优先使用项目既有命令，例如：

```bash
cd "$APP_DIR"
npm run migrate
```

### 迁移后核验

```bash
psql -U "$DB_USER" -d "$DB_NAME" -c '\dt'
psql -U "$DB_USER" -d "$DB_NAME" -c 'select now();'
```

核验重点：

- 新表、新字段、新索引已创建。
- OpenMAIC/MiniMax/火山/视频/TTS 相关配置表或记录存在。
- 迁移命令无错误退出码。
- 应用日志没有数据库连接、权限或字段缺失错误。

## Next.js 构建与 standalone 静态复制

### 安装依赖

```bash
cd "$APP_DIR"
npm ci
```

如果生产主机不能联网，应提前准备 npm 缓存或在构建机完成构建后同步产物。

### 生产构建

```bash
cd "$APP_DIR"
NODE_ENV=production npm run build
```

### standalone 产物核验

确认 `next.config.js` 已启用 `output: 'standalone'`，构建后应存在：

```bash
test -f .next/standalone/server.js
ls -la .next/standalone
```

### 复制静态资源

Next.js standalone 不会自动包含 `.next/static` 和 `public`。每次构建后执行：

```bash
cd "$APP_DIR"
rm -rf .next/standalone/.next/static .next/standalone/public
mkdir -p .next/standalone/.next
cp -a .next/static .next/standalone/.next/static
cp -a public .next/standalone/public
```

如 systemd `WorkingDirectory` 指向 `.next/standalone`，确保环境文件、上传目录、日志目录仍可被进程读取和写入。

## systemd 发布与重启

### 服务文件核验

```bash
sudo systemctl cat course-platform
```

建议服务满足：

- `WorkingDirectory=/opt/course-platform/.next/standalone` 或项目实际运行目录。
- `ExecStart` 指向 `node server.js` 或项目既有启动命令。
- `Environment=NODE_ENV=production`。
- `Environment=PORT=3000`。
- 密钥通过 `EnvironmentFile` 引入，不在服务文件中硬编码明文。
- 服务用户为非 root 用户。

### 重载并重启

```bash
sudo systemctl daemon-reload
sudo systemctl restart course-platform
sudo systemctl status course-platform --no-pager
journalctl -u course-platform -n 100 --no-pager
```

### 本机健康检查

```bash
curl -fsS "http://127.0.0.1:$APP_PORT/" >/dev/null
curl -fsS "http://127.0.0.1:$APP_PORT/api/health" || true
```

如健康检查路径不同，替换为项目实际健康检查 API。

## Nginx 与防火墙

### Nginx 配置核验

```bash
sudo nginx -t
sudo systemctl reload nginx
```

站点配置应满足：

- `80` 跳转到 `443`，或仅用于 ACME 证书校验。
- `443` 配置有效证书和安全 TLS 参数。
- `proxy_pass http://127.0.0.1:3000` 或实际本机端口。
- 设置 `Host`、`X-Real-IP`、`X-Forwarded-For`、`X-Forwarded-Proto`。
- 上传、视频或 AI 生成资源较大时，配置合理的 `client_max_body_size`。
- 长任务、流式响应或生成任务回调需要时，配置合理的 `proxy_read_timeout`。

### 防火墙端口

仅允许公网访问 `80/443`：

```bash
sudo ufw status verbose
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

如使用 firewalld：

```bash
sudo firewall-cmd --list-all
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

确认未开放 AI 内部端口：

```bash
ss -lntp
```

OpenMAIC、MiniMax 代理、火山代理、视频生成服务、TTS 服务如需监听端口，应绑定 `127.0.0.1` 或内网地址，并由课程平台后端调用。

## OpenMAIC/MiniMax/火山/视频/TTS 配置核验

禁止打印密钥值。只检查变量是否存在、URL 是否可达、模型名是否符合预期。

### 环境变量存在性

示例核验脚本不会显示明文：

```bash
cd "$APP_DIR"
node - <<'NODE'
const names = [
  'OPENMAIC_BASE_URL',
  'OPENMAIC_API_KEY',
  'MINIMAX_API_KEY',
  'MINIMAX_GROUP_ID',
  'VOLCENGINE_API_KEY',
  'VOLCENGINE_SECRET_KEY',
  'VIDEO_PROVIDER',
  'VIDEO_API_KEY',
  'TTS_BASE_URL',
  'TTS_API_KEY'
];
for (const name of names) {
  const value = process.env[name];
  console.log(`${name}: ${value ? 'SET' : 'MISSING'}`);
}
NODE
```

如果变量由 `.env.production` 提供，可用只显示键名的方式核验：

```bash
cd "$APP_DIR"
sed -n 's/^\([A-Z0-9_]*\)=.*/\1=SET/p' .env.production | sort
```

### 服务连通性

```bash
curl -fsS "$OPENMAIC_BASE_URL/health" || true
curl -fsS "$TTS_BASE_URL/health" || true
```

若 OpenMAIC/TTS 没有 `/health`，改用实际健康检查路径。MiniMax、火山、视频生成供应商通常不建议从生产终端打印鉴权请求详情，建议通过应用管理页或后端只返回脱敏状态：`configured`、`reachable`、`model_available`。

### 功能核验清单

- OpenMAIC：base URL 指向本机或内网；API key 已设置；任务创建、任务查询、错误返回可被课程平台识别。
- MiniMax：key/group/model 已设置；日志中不出现密钥；失败时展示供应商错误摘要而非完整请求。
- 火山：AK/SK 或 token 已设置；区域、模型、endpoint 与生产环境一致。
- 视频：provider、endpoint、回调地址、资源保存目录已设置；生成结果不会绕过课程平台资源库。
- TTS：base URL、默认模型、音色、输出格式已设置；音频文件落库或落盘路径可读写。

## 常用 smoke 脚本

以下脚本以只读或低风险请求为主。按项目实际 API 调整路径。

### Web 入口

```bash
set -euo pipefail
curl -I "https://$DOMAIN/"
curl -fsS "https://$DOMAIN/" >/dev/null
```

### 本机应用健康

```bash
set -euo pipefail
curl -fsS "http://127.0.0.1:$APP_PORT/api/health"
```

### 登录页与静态资源

```bash
set -euo pipefail
curl -fsS "https://$DOMAIN/login" >/dev/null
curl -fsS "https://$DOMAIN/_next/static/" >/dev/null || true
```

### AI 服务状态页或代理健康

```bash
set -euo pipefail
curl -fsS "https://$DOMAIN/api/openmaic/health" || true
curl -fsS "https://$DOMAIN/api/ai-services/health" || true
```

### TTS 代理健康

```bash
set -euo pipefail
curl -fsS "https://$DOMAIN/api/tts/health" || true
```

### 日志检查

```bash
journalctl -u course-platform -n 200 --no-pager | egrep -i 'error|exception|failed|openmaic|minimax|volc|tts|video' || true
sudo tail -n 100 /var/log/nginx/error.log
```

## 回滚步骤

### 判断是否需要回滚

满足任一条件应考虑回滚：

- 应用无法启动，且 10 分钟内无法定位修复。
- 数据库迁移后出现关键表/字段错误，影响登录、课程访问或资源访问。
- Nginx 反代或 TLS 异常导致公网不可用。
- OpenMAIC/TTS/视频配置导致主流程阻塞或持续报错。

### 应用代码和构建产物回滚

```bash
cd "$APP_DIR"
PREV_HEAD=$(cat "$BACKUP_ROOT/$RELEASE_TS/git-head.txt")
git status --short
git checkout "$PREV_HEAD" -- .
npm ci
NODE_ENV=production npm run build
rm -rf .next/standalone/.next/static .next/standalone/public
mkdir -p .next/standalone/.next
cp -a .next/static .next/standalone/.next/static
cp -a public .next/standalone/public
sudo systemctl restart course-platform
```

注意：如 `git status --short` 显示他人未提交修改，不要直接覆盖；先与协作者确认，或只恢复本次发布涉及的文件和构建产物。

### 数据库回滚

优先使用向后兼容的修复迁移。只有确认需要恢复整库时，才执行 dump 恢复，并先停止应用：

```bash
sudo systemctl stop course-platform
pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists "$BACKUP_ROOT/$RELEASE_TS/db.dump"
sudo systemctl start course-platform
```

整库恢复会覆盖迁移后数据，执行前必须确认业务影响和数据窗口。

### 配置回滚

```bash
sudo cp -a "$BACKUP_ROOT/$RELEASE_TS/course-platform.service" /etc/systemd/system/course-platform.service 2>/dev/null || true
sudo cp -a "$BACKUP_ROOT/$RELEASE_TS/course-platform" /etc/nginx/sites-available/course-platform 2>/dev/null || true
cp -a "$BACKUP_ROOT/$RELEASE_TS/.env.production" "$APP_DIR/.env.production" 2>/dev/null || true
sudo systemctl daemon-reload
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl restart course-platform
```

## 重启恢复

主机重启或异常断电后，按以下顺序恢复：

```bash
sudo systemctl status postgresql --no-pager || true
sudo systemctl status redis-server --no-pager || true
sudo systemctl status nginx --no-pager
sudo systemctl status course-platform --no-pager
```

如服务未运行：

```bash
sudo systemctl start postgresql redis-server nginx course-platform
sudo systemctl enable nginx course-platform
```

恢复后核验：

```bash
ss -lntp
curl -fsS "http://127.0.0.1:$APP_PORT/api/health" || true
curl -fsS "https://$DOMAIN/" >/dev/null
journalctl -u course-platform -n 100 --no-pager
```

重点确认：

- Nginx 已监听 `80/443`。
- Next.js 应用已监听本机端口。
- 数据库、Redis、资源目录可访问。
- OpenMAIC/TTS/视频等内部服务未暴露公网。
- AI 相关密钥仍为 `SET`，日志未泄露明文。

## 发布完成记录

发布完成后记录以下信息：

```bash
date -Is
git rev-parse HEAD
systemctl is-active course-platform
systemctl is-active nginx
curl -fsS "https://$DOMAIN/" >/dev/null && echo 'web ok'
```

建议在发布记录中写明：迁移文件、备份目录、构建时间、重启时间、smoke 结果、是否执行回滚、遗留问题和负责人。
