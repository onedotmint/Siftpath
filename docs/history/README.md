# 历史交付记录

这些文件保留原源码交付时的环境、目标、实现背景与验证声明，不代表当前 Siftpath 仓库已经通过同样的检查。

- [DELIVERY.md](DELIVERY.md)：原交付状态、环境限制与产物说明。
- [PREFLIGHT.md](PREFLIGHT.md)：原环境检查及当时的依赖获取问题。
- [MIGRATION.md](MIGRATION.md)：从 SmartSearch 1.x 重建实现的背景与复用范围。

其中的旧仓库、分支、路径、版本与外部 bundle/tarball 是历史记录，不能当作当前可用的文件或发布入口。旧记录保留的相对路径文本也应按当时布局理解。

当前说明见 [仓库导览](../REPOSITORY.md)、[开发指南](../DEVELOPMENT.md)、[命名迁移](../MIGRATION.md) 和 [引用来源](../REFERENCES.md)。

本轮迁移未运行测试、构建、基准或真实服务商调用。依赖完整性哈希已从 npm 官方读取补齐，但未执行干净安装。唯一执行的项目脚本是客户端资产同步脚本，不是行为验证。
