# 后端开发指南

## 1. 这份文档适合谁

如果你准备在 Paperclip 的后端新增或修改这些内容，这份文档最有用：

- 新增一个 API 路由
- 修改某个服务层行为
- 增加一个治理规则
- 调整 heartbeat、issue、approval、budget 等核心逻辑
- 引入新表或修改已有 schema

## 2. 后端的基本工作方式

Paperclip 后端的主组织方式是：

- `routes/` 负责 HTTP 出口
- `services/` 负责业务逻辑
- `middleware/` 负责认证、日志、校验和网关保护
- `storage/` / `secrets/` / `adapters/` / `realtime/` 负责横向能力

开发时最重要的习惯是：**不要把业务逻辑堆进 route 文件里。**

推荐模式：

1. 在 route 中解析参数、做资源存在性检查
2. 在 route 中做公司访问边界校验
3. 调 service 处理真实业务
4. 视需要写 activity log
5. 返回统一的 HTTP 结果

## 3. 新增一个后端功能时的建议顺序

### 场景 A：只改行为，不改数据模型

建议顺序：

1. 找到对应资源的 route 文件
2. 找到对应 service
3. 先补测试，再改行为
4. 检查是否需要 activity log
5. 检查是否涉及 approval / budget / company access
6. 若前端依赖变更，再同步 `packages/shared` 和 `ui`

### 场景 B：涉及数据模型

建议顺序：

1. 改 `packages/db/src/schema/*.ts`
2. 确保导出到 `packages/db/src/schema/index.ts`
3. 如果 API 契约变了，同步改 `packages/shared`
4. 改 server service / routes
5. 改 UI API client / 页面
6. 生成 migration
7. 跑 typecheck / test / build

这和仓库根 AGENTS 的要求是一致的。

## 4. 路由开发建议

典型路由文件可以参考：

- `server/src/routes/issues.ts`
- `server/src/routes/agents.ts`
- `server/src/routes/approvals.ts`

后端路由在 Paperclip 里通常承担这些职责：

- 解析路径参数和 query
- 调用 zod schema 做 body 校验
- 读取 actor 信息
- 检查资源是否存在
- 检查 company access 或 board/agent 权限
- 调 service
- 记录 activity

常见帮助函数有：

- `assertBoard`
- `assertCompanyAccess`
- `getActorInfo`
- `validate(...)`

如果你新增一个 route，优先复用现有模式，不要另起炉灶做一套新的认证风格。

## 5. Service 开发建议

Service 是最值得保持边界清晰的地方。一个好的 service 逻辑通常具备这几个特征：

- 围绕一个业务对象或一条业务流程
- 不依赖 HTTP 语义
- 对事务边界有明确控制
- 对异常类型有明确表达
- 不偷偷跨公司操作资源

如果你在 service 里发现需要大量操作 `req`、`res`，通常说明代码放错层了。

## 6. 错误处理风格

后端已有统一错误模型，常见类型包括：

- `notFound`
- `conflict`
- `unprocessable`
- `forbidden`

优先使用这些语义化错误，而不是手写一堆 `throw new Error(...)`。这样：

- route 层返回更一致
- logger 和 telemetry 更好聚合
- 测试断言更稳定

## 7. Activity Log 是后端开发中的关键检查项

在 Paperclip 里，很多改动不只是“改状态”，还要满足可审计。一个很实用的开发自检问题是：

> 这个变更是否需要被董事会看到？

如果答案是“需要”，通常就应该考虑写 activity log。

尤其这些操作常常要补 activity：

- 创建/更新/删除业务对象
- 审批相关决策
- issue 评论、文档、附件变化
- heartbeat 调用或取消
- agent 生命周期变化

## 8. 权限与公司边界自检清单

写任何新后端功能时，建议自查：

- 是否确认了资源存在？
- 是否确认资源属于当前 company？
- 是否确认 actor 有权访问？
- 是否区分了 board 与 agent 的能力？
- 是否避免 agent key 跨公司访问？

如果这些问题没有明确答案，通常这段代码还没写完整。

## 9. 数据模型变更的同步点

只要改 schema，就至少检查这几层：

- `packages/db`
- `packages/shared`
- `server`
- `ui`

这是 Paperclip 一个很重要的工程原则：**契约同步**。

如果只改了数据库，不改 shared 与 UI，代码通常会很快出现“类型没问题但行为不一致”的问题。

## 10. Heartbeat 相关改动要特别谨慎

`heartbeat.ts` 是全仓库最复杂的服务之一。对这块做改动时尤其要先想清楚：

- 会不会影响运行恢复？
- 会不会影响 usage / cost 记录？
- 会不会破坏 session 型 adapter 的连续性？
- 会不会破坏 workspace 解析？
- 会不会改变 UI 对 run 的展示契约？

这类改动建议尽量配测试，而不是依赖手工验证。

## 11. 测试建议

后端测试主要集中在：

- `server/src/__tests__/`

这里已经有大量 route 和 service 行为测试。新增行为时，优先：

- 找一个最接近的现有测试
- 按那个模式补新测试
- 先让测试失败，再改实现

这会比从零搭测试快很多，也更符合仓库现有风格。

## 12. 最后的一条经验

在 Paperclip 里，好的后端改动通常不是“把某个功能做出来”，而是同时满足这四件事：

- 业务行为正确
- 公司边界正确
- 治理与审计正确
- 契约同步正确

只做到第一点，通常还不算真的完成。
