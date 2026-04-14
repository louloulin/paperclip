# Paperclip 全局问题分析（PB1）

> 说明：这份文档基于当前仓库代码、`doc/` 内部文档、`docs/` 公开文档，以及本次对核心服务、适配器、插件、CLI、运行机制的交叉阅读整理而成。
>
> 它不是逐文件审计，也不是完整的安全报告，而是一份“当前最值得优先关注的问题清单”。

## 总体判断

Paperclip 已经不是 demo，而是一套功能闭环明显成立的 AI 公司控制平面产品。但当前代码库同时存在三类明显问题：

1. **规范与实现漂移**
   V1 契约、分支策略、内部文档、公开文档和当前实现之间已经出现多处不一致。
2. **复杂度过高**
   若干关键服务和页面已经膨胀到难以稳定演进的规模，维护风险很高。
3. **扩展模型仍处于“强能力、弱隔离”阶段**
   插件系统、适配器系统和多种运行机制已经落地，但安全边界、部署假设和云端可用性还不够成熟。

---

## 1. V1 契约与实际实现明显漂移

### 证据

- `doc/SPEC-implementation.md` 仍把 V1 的 agent adapter 定义为仅内建 `process | http`，见 [doc/SPEC-implementation.md:41](/Users/louloulin/Documents/linchong/claw/paperclip/doc/SPEC-implementation.md#L41)
- 同一文档仍把“Plugin framework and third-party extension SDK”列为 V1 out of scope，见 [doc/SPEC-implementation.md:74](/Users/louloulin/Documents/linchong/claw/paperclip/doc/SPEC-implementation.md#L74)
- 但当前 `server/src/app.ts` 已经在主应用启动时初始化整套 plugin runtime，包括 worker manager、event bus、job scheduler、tool dispatcher、lifecycle、loader 和 plugin routes，见 [server/src/app.ts:172](/Users/louloulin/Documents/linchong/claw/paperclip/server/src/app.ts#L172)
- `doc/plugins/PLUGIN_SPEC.md` 也明确承认当前仓库已经包含“early plugin runtime and admin UI”，见 [doc/plugins/PLUGIN_SPEC.md:13](/Users/louloulin/Documents/linchong/claw/paperclip/doc/plugins/PLUGIN_SPEC.md#L13)

### 问题

当前仓库的现实能力已经明显超出 V1 实现契约，而主规范文档没有及时升级。

这会带来两个直接后果：

- 新开发者会基于过时文档理解系统边界
- 后续评审、测试、发布很难判断“这是规格内变更还是实验性扩展”

### 影响

- 架构讨论缺少统一基线
- 需求优先级和“完成定义”容易失真
- 文档驱动开发和代码驱动开发出现脱节

### 建议方向

- 选择其一：
  - 更新 `doc/SPEC-implementation.md`，承认插件/多内建 adapter/更多运行能力已进入“当前实现”
  - 或者把这些能力明确标注为 “post-V1 landed experimental surfaces”
- 给 `doc/PRODUCT.md` 和 `doc/SPEC-implementation.md` 增加“当前实现现实（code reality）”章节，避免继续把旧边界当成有效契约

---

## 2. 任务模型文档仍停留在旧的 team / milestone / initiative 体系

### 证据

- `doc/TASKS.md` 明确写着“some of this is already implemented, some is aspirational”，见 [doc/TASKS.md:3](/Users/louloulin/Documents/linchong/claw/paperclip/doc/TASKS.md#L3)
- 该文档的层级仍是 `Workspace -> Initiatives -> Projects -> Milestones -> Issues -> Sub-issues`，并把 `teamId`、workflow states per-team 作为任务模型中心，见 [doc/TASKS.md:11](/Users/louloulin/Documents/linchong/claw/paperclip/doc/TASKS.md#L11) 和 [doc/TASKS.md:42](/Users/louloulin/Documents/linchong/claw/paperclip/doc/TASKS.md#L42)
- 但当前真实实现是 company-first、goal/project/issue 模型，且 V1 规范强调 company-scoped entities，见 [doc/SPEC-implementation.md:34](/Users/louloulin/Documents/linchong/claw/paperclip/doc/SPEC-implementation.md#L34)

### 问题

任务数据模型文档仍然描述一套较早期、偏传统 project management 的抽象，而当前代码早已转向“company / org / goal / issue / heartbeat”的控制平面模型。

### 影响

- 读文档的人会误以为“team/workflow-state subsystem”是当前核心对象
- 新功能设计时容易围绕旧模型讨论，造成命名和数据结构混乱

### 建议方向

- 将 `doc/TASKS.md` 改成：
  - “历史目标模型（deprecated / aspirational）”
  - 或彻底重写为当前 issue-goal-project-company 模型
- 如果保留旧文档，必须在开头加醒目的“非当前实现”说明

---

## 3. Fork 的 Hermes 外置化策略与当前代码不一致

### 证据

- 根 `AGENTS.md` 明确写明该 fork 的 `feat/externalize-hermes-adapter` 分支应当：
  - 核心代码 **没有** `hermes-paperclip-adapter` 依赖
  - **没有** built-in `hermes_local` 注册
  见 [AGENTS.md:168](/Users/louloulin/Documents/linchong/claw/paperclip/AGENTS.md#L168)
- 但 `server/package.json` 仍直接依赖 `hermes-paperclip-adapter`，见 [server/package.json:69](/Users/louloulin/Documents/linchong/claw/paperclip/server/package.json#L69)
- `ui/package.json` 也仍直接依赖 `hermes-paperclip-adapter`，见 [ui/package.json:49](/Users/louloulin/Documents/linchong/claw/paperclip/ui/package.json#L49)
- `server/src/adapters/builtin-adapter-types.ts` 仍把 `hermes_local` 当作 built-in adapter type，见 [server/src/adapters/builtin-adapter-types.ts:12](/Users/louloulin/Documents/linchong/claw/paperclip/server/src/adapters/builtin-adapter-types.ts#L12)
- 同时 `packages/shared/src/constants.ts` 的 `AGENT_ADAPTER_TYPES` 却 **没有** `hermes_local`，见 [packages/shared/src/constants.ts:24](/Users/louloulin/Documents/linchong/claw/paperclip/packages/shared/src/constants.ts#L24)

### 问题

这里不只是“文档和代码不一致”，而是已经出现了三套同时存在的真相：

- fork 策略说 Hermes 应完全外置
- server 运行时仍视它为 built-in
- shared 常量又没有把它作为稳定内建类型

### 影响

- adapter 类型集合不再是单一事实来源
- UI、server、shared、文档可能分别做出不同假设
- 外置化推进时容易留下半外置半内建的状态

### 建议方向

- 尽快做出二选一：
  - 真正完成 Hermes external-only
  - 或承认当前分支仍含内建 Hermes，并修正 `AGENTS.md`
- 无论选哪条路，都要统一：
  - `shared` adapter constants
  - `server` builtin registry
  - UI/README/docs 中的描述

---

## 4. Plugin 能力边界很强，但隔离边界还很弱

### 证据

- `doc/plugins/PLUGIN_SPEC.md` 直接说明：
  - plugin UI 以 same-origin JavaScript 运行
  - manifest capabilities 仅限制 worker-side host RPC
  - plugin UI 仍可直接调用普通 Paperclip HTTP API
  见 [doc/plugins/PLUGIN_SPEC.md:23](/Users/louloulin/Documents/linchong/claw/paperclip/doc/plugins/PLUGIN_SPEC.md#L23)
- 同文档还明确写：
  - 当前模型是 single-node / filesystem-persistent
  - 动态安装不 cloud-ready
  见 [doc/plugins/PLUGIN_SPEC.md:19](/Users/louloulin/Documents/linchong/claw/paperclip/doc/plugins/PLUGIN_SPEC.md#L19) 和 [doc/plugins/PLUGIN_SPEC.md:29](/Users/louloulin/Documents/linchong/claw/paperclip/doc/plugins/PLUGIN_SPEC.md#L29)
- 但 `server/src/app.ts` 已经把 plugin runtime 作为主系统一部分初始化，见 [server/src/app.ts:172](/Users/louloulin/Documents/linchong/claw/paperclip/server/src/app.ts#L172)

### 问题

插件系统当前已经足够强大到影响宿主的工具、作业、页面和 worker 生命周期，但它的安全/部署边界还停留在：

- trusted code
- same-origin UI
- writable local fs
- single-node 假设

这意味着它更像“本地/自托管扩展能力”，而不是一个成熟的多租户、可分发、能力可约束的平台插件体系。

### 影响

- 插件能力声明容易给人“受限能力模型”的错觉，但前端并没有真正隔离
- 云端或多实例场景下难以可靠部署
- 宿主攻击面随插件面迅速扩大

### 建议方向

- 在产品与文档层明确：
  - 当前 plugin runtime 是“trusted extensions for self-hosted mode”
- 在技术层至少补两件事：
  - 更明确的 UI 安全边界说明
  - 面向云/多实例的分发与安装协调路线图

---

## 5. Dev 自动重启的“空闲”判定过于粗糙，容易误杀正在进行的 UI 交互

### 证据

- `scripts/dev-runner.ts` 的自动重启判定当前只看 `devServer.activeRunCount`，见 [scripts/dev-runner.ts:562](/Users/louloulin/Documents/linchong/claw/paperclip/scripts/dev-runner.ts#L562) 和 [scripts/dev-runner.ts:575](/Users/louloulin/Documents/linchong/claw/paperclip/scripts/dev-runner.ts#L575)
- `/api/health` 中 `devServer` 信息主要来自“当前 queued/running heartbeat runs 计数”，见 [server/src/routes/health.ts:78](/Users/louloulin/Documents/linchong/claw/paperclip/server/src/routes/health.ts#L78)

### 问题

这意味着 dev runner 默认只把“有没有 live heartbeat run”当成“是否空闲”的依据。

但真实开发时，下面这些情况同样不应该被自动重启打断：

- 用户刚保存 issue document / plan
- UI 正在跑 mutation
- 用户刚触发一组连续页面请求
- 前端仍在等待请求/响应稳定

实际表现就是：**没有 live run 时，dev runner 可能在正常 UI 使用过程中直接向 server 子进程发 `SIGTERM`。**

### 影响

- 本地开发体验不稳定
- 容易把“用户操作后的自然重启”误判成服务异常退出
- 增加调试难度

### 建议方向

- “空闲”判定至少应结合：
  - active request count
  - recent request activity quiet window
  - active run count
- 让 health/dev status 显式区分：
  - waiting for runs
  - waiting for requests
  - just changed backend files

---

## 6. 关键服务和页面已经膨胀到高风险体量

### 证据

当前仓库中多个核心文件已经达到极高行数：

- `server/src/services/heartbeat.ts`：4479 行
- `server/src/services/company-portability.ts`：4415 行
- `ui/src/pages/AgentDetail.tsx`：4120 行
- `server/src/routes/access.ts`：2940 行
- `cli/src/commands/worktree.ts`：2662 行
- `server/src/services/issues.ts`：2455 行
- `server/src/routes/issues.ts`：2317 行
- `server/src/services/workspace-runtime.ts`：2388 行
- `server/src/services/company-skills.ts`：2371 行

### 问题

这些文件已经超过了“单文件单职责”的健康边界。问题不是“大文件不好看”，而是：

- 代码语义难以局部推理
- 回归风险上升
- 测试难以精准覆盖
- 新开发者很难找到可修改边界
- 一个改动容易牵动多个隐式耦合点

### 影响

- 维护速度下降
- review 成本上升
- 缺陷更容易在重构或功能扩展时引入

### 建议方向

- 不建议一次性大重构
- 但应把这些文件列为“持续拆分治理对象”
- 每次改动相关文件时，优先把一个小责任块抽离出去，而不是继续堆逻辑

---

## 7. 文档系统已经分裂成 `doc/` 与 `docs/` 两套事实来源，且内容出现明显冲突

### 证据

- 公开站点文档 `docs/start/architecture.md` 仍写 “PostgreSQL 17 (or embedded PGlite)”，见 [docs/start/architecture.md:33](/Users/louloulin/Documents/linchong/claw/paperclip/docs/start/architecture.md#L33)
- 但内部开发文档和数据库文档都已经明确是 embedded PostgreSQL，而不是 PGlite，见 [doc/DEVELOPING.md:111](/Users/louloulin/Documents/linchong/claw/paperclip/doc/DEVELOPING.md#L111) 和 [doc/DATABASE.md:5](/Users/louloulin/Documents/linchong/claw/paperclip/doc/DATABASE.md#L5)
- `docs/adapters/overview.md` 还写 `gemini_local` “not yet in stable type enum”，见 [docs/adapters/overview.md:23](/Users/louloulin/Documents/linchong/claw/paperclip/docs/adapters/overview.md#L23)
- 但 `packages/shared/src/constants.ts` 已经把 `gemini_local` 放进稳定 `AGENT_ADAPTER_TYPES`，见 [packages/shared/src/constants.ts:24](/Users/louloulin/Documents/linchong/claw/paperclip/packages/shared/src/constants.ts#L24)

### 问题

现在仓库实际存在两套文档体系：

- `doc/`：内部设计与实现文档
- `docs/`：面向站点/公开使用的文档

两者没有强一致机制，于是开始出现“产品事实分叉”。

### 影响

- 用户、贡献者、维护者看到的系统边界不一致
- 文档反而增加认知负担
- 搜索资料时很难判断哪个版本才是当前真实情况

### 建议方向

- 明确：
  - `doc/` 是 internal design source of truth
  - `docs/` 是 curated public docs
- 建立定期对齐机制，至少对这些主题同步：
  - adapters
  - deployment modes
  - storage/database defaults
  - plugin current limitations

---

## 8. CLI 与公开产品能力之间仍有“已知未完成接口”

### 证据

- `doc/CLI.md` 明确写 `paperclipai run` 和 `paperclipai doctor` 还没有直接的 `--mode` flag，见 [doc/CLI.md:36](/Users/louloulin/Documents/linchong/claw/paperclip/doc/CLI.md#L36)
- 文档里已经形成了完整的 deployment mode taxonomy，但 CLI 表面并未完全把它产品化
- `server/src/services/plugin-loader.ts` 中 `registryUrl` 字段仍是保留位，remote registry discovery “not yet implemented”，见 [server/src/services/plugin-loader.ts:163](/Users/louloulin/Documents/linchong/claw/paperclip/server/src/services/plugin-loader.ts#L163)

### 问题

Paperclip 的产品表述和内部设计已经指向更成熟的运维和扩展体验，但在 CLI / operator surface 上仍有一些“文档先于能力”的区域。

这不一定是 bug，但确实会形成“功能看起来存在，操作者实际却不能直达”的体验落差。

### 影响

- 学习成本增加
- 用户需要记环境变量或内部知识
- 运维表面不够统一

### 建议方向

- 把这些未完成接口集中列成“operator gap list”
- 优先补齐直接影响日常使用的 CLI 能力，而不是继续增加内部抽象

---

## 9. 当前最应该优先处理的不是“加功能”，而是“收敛事实来源和边界”

### 原因

从当前仓库状态看，最危险的不是功能不足，而是：

- 规格说一套
- fork 策略说一套
- 运行时代码做一套
- 公开文档再说一套

这会让系统逐渐进入“只有老维护者知道真实行为”的状态。

### 建议优先级

#### P1：统一事实来源

- 更新 V1/当前实现边界文档
- 修正 Hermes external-only 与当前代码不一致问题
- 清理 adapters/docs 中的明显过时表述

#### P2：稳定开发体验

- 修 dev auto-restart 的空闲判定
- 让 dev status 更准确表达“为什么会重启”

#### P3：持续拆大文件

- heartbeat
- issues
- workspace-runtime
- AgentDetail
- access routes

#### P4：重新定义插件定位

- 明确它当前是 trusted self-hosted plugin runtime
- 不要让 capability model 给出超出当前实现的安全承诺

---

## 附：一句话结论

**Paperclip 的核心产品方向是对的，能力也已经很强，但当前最突出的问题不是“不会做事”，而是“系统边界、文档边界和实现边界正在分叉”。**

如果不先收敛这些边界，后续无论继续做插件、适配器、协作能力还是云端化，成本都会越来越高。
