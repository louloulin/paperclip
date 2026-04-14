# 前端开发指南

## 1. 前端开发的目标

Paperclip 前端不是营销站点，也不是聊天界面。它的核心任务是：

- 让董事会和操作者看清系统状态
- 让复杂的工作流对象可管理
- 让运行中的状态可观察
- 让插件和 adapter UI 能平滑接入

因此前端开发的重点通常不是“炫技组件”，而是：

- 信息架构
- 状态同步
- 容错与反馈
- 与后端契约保持一致

## 2. UI 的典型分层

Paperclip 前端大致分三层：

### 页面层 `pages/`

负责：

- 路由入口
- 查询组合
- 页面布局
- 大块业务逻辑编排

### 组件层 `components/`

负责：

- 具体交互
- 属性面板
- 列表、卡片、编辑器、弹窗
- 文档、评论、运行展示等局部业务视图

### API / lib / context 层

负责：

- API client
- query key
- 小型业务逻辑函数
- 全局上下文状态

如果某段逻辑既不是纯展示，也不适合直接放页面中，通常应该落到 `lib/`、`hooks/` 或 `context/`。

## 3. 新增一个页面时怎么做

建议顺序：

1. 在 `ui/src/pages/` 新建页面
2. 在 `ui/src/App.tsx` 注册路由
3. 如果需要访问后端，先补 `ui/src/api/*.ts`
4. 把共享数据取用放到 query 层
5. 把大段业务交互拆到 `components/`
6. 如果页面与公司上下文相关，确认路由和跳转保留 company prefix

## 4. Company 上下文是前端的第一层边界

Paperclip 前端大量交互都建立在“当前选中的 company”之上，因此：

- `CompanyContext`
- `router.tsx`
- company prefix 路由

是很关键的基础设施。

前端开发时要特别注意：

- 新链接是否保留了公司前缀
- 新页面是否依赖 selectedCompany
- API 查询是否正确使用 company 作用域

如果这里处理不好，用户会很容易在多公司环境中迷失上下文。

## 5. API client 的使用方式

`ui/src/api/client.ts` 提供统一请求封装，特点是：

- 默认走 `/api`
- 默认 `credentials: include`
- 统一处理 JSON body 和错误
- 使用 `ApiError` 暴露状态码和响应体

前端新增后端调用时，建议：

1. 先在 `ui/src/api/<resource>.ts` 增加函数
2. 页面和组件只调用这个函数
3. 不要在页面里到处直接 `fetch(...)`

这样 API 层更清晰，也更容易统一修改行为。

## 6. Query 与缓存更新

前端大量使用 TanStack Query，因此开发时要特别关注两件事：

- query key 是否统一
- mutation 后是否正确更新或失效缓存

通常会配合：

- `queryKeys`
- `invalidateQueries`
- optimistic update

Issue 详情、评论、文档这类交互尤其依赖缓存同步，直接修改本地 state 往往不够。

## 7. 实时更新与运行中状态

Paperclip 前端一个比较特殊的点是：它有很多“运行中”的内容，例如：

- live run
- activity toast
- 页面当前正在看的 issue
- WebSocket 推送带来的实时变化

这些逻辑很多通过 `LiveUpdatesProvider` 来协调。开发时如果涉及运行状态展示，先确认自己修改的内容会不会影响：

- query 缓存同步
- toast 展示
- 页面可见性判断
- 当前 issue 上的 suppress 逻辑

## 8. 复杂页面的拆分思路

像 `IssueDetail.tsx` 这样的页面已经很重。开发时不建议继续把所有逻辑直接塞进去，而是优先拆成：

- 页面级查询与布局
- 面板级组件
- 独立业务区域组件
- 共享 helper / lib

例如：

- 文档区放 `IssueDocumentsSection`
- 评论区放 `CommentThread`
- 工作区状态放 `IssueWorkspaceCard`
- 运行区放 `LiveRunWidget`

这种拆分方式在现有代码里已经有先例，尽量延续它。

## 9. Adapter UI 与 Plugin UI

前端有两类特殊扩展：

### Adapter UI

位于 `ui/src/adapters/`，负责：

- 配置表单
- stdout/transcript 解析
- metadata 展示

如果你在做 agent 配置相关功能，优先看这里，而不是只看普通页面组件。

### Plugin UI

位于 `ui/src/plugins/`，负责：

- plugin bridge 初始化
- slot / launcher 渲染
- 插件页面挂载

如果你在做插件相关前端接入，优先保证它遵循现有 slot/launcher 机制，而不是硬编码塞到某个页面。

## 10. 文案与用户反馈

Paperclip 是一个复杂控制台，所以错误处理和用户反馈尤其重要。前端新增功能时要想清楚：

- 请求失败时用户看到什么？
- 保存成功时是否需要 toast？
- 空状态是否可理解？
- 正在加载时是否有合理占位？

“静默失败”在这种产品里会特别伤。

## 11. 样式与视觉风格

这是一个已有设计语言的产品，开发新页面或组件时应尽量：

- 复用现有布局组件
- 复用状态色和 badge 习惯
- 复用现有 panel / sheet / tabs 风格
- 保持信息密度与管理台气质一致

除非你是在专门做设计系统演进，否则不要让新页面突然像另一个产品。

## 12. 一条实用经验

好的前端改动，通常同时满足：

- 路由和公司上下文正确
- API 契约和缓存同步正确
- 页面结构与组件拆分清晰
- 错误与空状态可理解

只把界面画出来，还不够。
