# 构建、验收与 Release 说明

## 1. 常用工程命令

```bash
npm install          # 安装依赖
npm run dev          # 启动本地开发服务器
npm run check        # 运行 5 道构建前静默门禁（0 循环依赖、离线红线、零 GC、内容配额）
npm run type-check   # Vue + TypeScript 严格类型检查
npm run test         # 运行 Vitest 41 项单元测试与无头战斗模拟
npm run build        # 标准 Vite 多文件构建 (dist-web/)
npm run build:single # 构建版本化单文件 HTML (dist/tiny-vanguard-<版本>-<YYYYMMDD-HHmmss>.html) 并同步到 ../docs/index.html
npm run verify:single# 校验单 HTML 离线纯净度、经典脚本兼容性、<=1.5 MiB 体积与 docs/index.html 一致性
npm run gate         # 串联执行 check -> type-check -> test -> build:single -> verify:single
```

## 2. 资源来源与许可声明

- **程序化 3D 模型、贴图与音效**：本项目全部角色、敌人、地面网格贴图与 Web Audio 合成音效均由代码实时/程序化生成，100% 原创，零外部模型、图片或音频文件依赖。
- **运行库与构建工具**：
  - `vue` (`^3.5.13`) — MIT License
  - `three` (`^0.170.0`) — MIT License
  - `vite` / `vite-plugin-singlefile` — MIT License

## 3. GitHub Actions Release 流程

工作流文件位于 `.github/workflows/release.yml`：
- 触发方式：推送 `v*` 版本标签（如 `v1.0.0`）或在 GitHub Actions 页面手动触发 `workflow_dispatch`。
- 门禁顺序：`npm ci` → 校验 Git Tag 与 `package.json` 版本一致 → `npm run gate`（含 `check` → `type-check` → `test` → `build:single` → `verify:single`）→ 生成 `.sha256` 校验文件 → 上传 Actions 构建产物。GitHub Release 单独发布，附上已选定的单文件 HTML，避免门禁重新打包覆盖版本说明和附件。
