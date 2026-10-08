# 开发与发布

## 当前入口

Siftpath 是一个严格 TypeScript ESM 包，包名 `@onedotmint/siftpath`，主命令 `siftpath`，需要 Node.js 22+ 和 npm。源码、`package.json`、锁文件、`.github/workflows/` 和插件发现清单均位于仓库根目录；**所有命令从根目录执行**，不使用 workspace 或嵌套包目录。构建后的包零运行时依赖，无 Python 启动或包装层。开发依赖固定为 TypeScript 5.8.3 和 Node types 22.19.7。

[根 README](../README.md) 给出源码安装步骤，[仓库导览](REPOSITORY.md) 给出阅读顺序。下面的命令是开发/发布操作说明，不是本轮已执行的验证记录。

```bash
npm ci --ignore-scripts
npm run build
npm run typecheck
npm test
npm run bench
npm run verify:source
npm run pack:dry
```

`build` 先执行 `sync:integrations`，再编译到 `dist/`，包含声明和 source maps。源码构建需要开发依赖；本地打包后的使用不需要编译器。编译配置拒绝未使用符号和未检查的索引访问；测试使用 Node 内置 runner。测试范围及 live opt-in 规则见 [TESTING.md](TESTING.md)。

保持一个包、一个核心、薄适配层：契约放在 `src/core/types.ts`，厂商映射放在 `src/providers/`，Agent schema 与调用边界放在 `src/tools.ts`，宿主行为放在其 adapter。用组合增加行为；两个真实消费者再考虑抽象。不要因为 SDK 可配置更多参数，就把服务商选择暴露给三个 Agent 工具。

## 版本的单一来源

当前版本仍是 `2.0.0-next.1`，没有因命名迁移而升版。`package.json` 是版本元数据的单一来源；`src/version.ts` 从相邻的 `package.json` 读取，CLI 和 MCP 使用该模块，不再各自硬编码版本。集成生成脚本也读取同一份包元数据。

后续有意发布新版本时，同步包元数据与锁文件，并重新生成集成资产；不要手改 CLI、MCP 或生成清单中的版本，也不需要为此引入完整发布框架。

## 规范源与生成资产

- `skills/web-research/` 是 Agent 指引的规范源。
- `scripts/sync-integrations.mjs` 是宿主打包规则的规范源；读取包版本，复制 skill，生成宿主清单、命令、指南以及根目录 marketplace 清单。
- `integrations/` 中生成的副本和 `.agents/`、`.cursor-plugin/`、`.claude-plugin/` 清单应随源码提交，不能成为另一份检索实现。
- 修改检索逻辑只在 `src/`；修改共享指引只在规范 skill。调整宿主生成内容应改生成脚本，而非只改输出副本。

需要单独刷新时可运行 `npm run sync:integrations`。通常 `npm run build` 会自动同步；`npm pack` 的 `prepack` 也自动调用 build。使用 `--ignore-scripts` 打包会跳过这一保障，应仅在明确已完成构建时使用。生成后审阅差异并提交对应资产。

## CI 与打包入口

根目录 `.github/workflows/test.yml` 定义 Node 22/24、Linux/Windows 检查；`package.yml` 提供手动包产物入口。工作流使用根目录锁文件和根目录 npm 命令，不再指向旧子目录。

CI 定义会先同步集成，再用 `git diff --exit-code -- integrations .agents .cursor-plugin .claude-plugin` 检查生成差异，避免规范源与提交资产脱节。随后进行相应检查和打包。**这些是工作流定义，不是本轮 hosted CI 已通过的结果。** live 测试缺少显式 opt-in 时跳过，不能算作真实服务商验证。工作流不会自动发布 npm 包或创建 Release。

本地 tarball 可从根目录生成：

```bash
npm pack
```

这会触发 prepack/build，生成当前版本对应的 `onedotmint-siftpath-2.0.0-next.1.tgz`。`npm run pack:dry` 先构建再做打包预览，不生成正式 tarball。发布前应审阅包内容、在隔离位置安装实际 tarball 并检查 CLI/集成；这些操作须在允许验证时执行。不要假定预发布版本号表示 npm 已发布，也不要把文件名当成已存在的 Release 下载入口。

## 锁文件与未验证边界

`package-lock.json` 使用 registry tarball，不记录本机绝对链接。此前 `@types/node` 与 `undici-types` 缺失的两个 integrity 已从 npm 官方元数据补齐；补齐哈希**不等于干净安装通过**。下一次允许验证时，以 `npm ci --ignore-scripts` 检查可复现安装，不要为消除环境问题而写入本机 symlink 或编造哈希。

本轮仅执行客户端资产同步脚本，并通过 npm 官方 registry 读取依赖完整性元数据；没有安装依赖、运行测试、类型检查、构建、打包、基准、源码验证脚本或真实服务商 API，也没有验证 hosted CI、Windows、实际客户端 UI 或公共分发。既有模拟契约与合成评估不能代替具备权限、密钥和费用授权的真实服务商验证。稳定发布仍应由维护者在实际验证后明确决定。

## 历史与迁移

- [当前迁移说明](MIGRATION.md)：包名、命令、环境变量、配置复用与旧版边界。
- [历史交付](history/DELIVERY.md)、[历史预检](history/PREFLIGHT.md)、[历史迁移](history/MIGRATION.md)：此前重建源码、独立基线和交付环境记录。
- [历史索引](history/README.md)、[来源与实际复用](REFERENCES.md)：溯源与保留的历史材料。

历史命令、产物、网络限制和验证结果仅属于当时交付，不能作为当前 checkout、命名迁移或发布成功的证明；也不能假定历史 checkpoint bundle 与旧上游有共同祖先。
