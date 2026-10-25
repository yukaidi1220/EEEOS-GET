# 恢复部署 & 防 60 天自动禁用

## 事故回顾

2026-09-20 起，本站每 6 小时的自动部署彻底停更。原因不是构建失败：GitHub 会在仓库
**连续 60 天无 push** 后自动停用该仓库所有 `schedule` 触发的工作流（状态
`disabled_inactivity`）。本仓最后一次 push 是 2026-07-22，9/20 整好到期。

## 恢复步骤

```bash
# 1. 重新启用工作流（push 过任意 commit 后才有效；本仓库已有新提交即可）
gh workflow enable "Build & Deploy to EdgeOne Pages" -R yukaidi1220/EEEOS-GET

# 2. 手动触发一次验证
gh workflow run "Build & Deploy to EdgeOne Pages" -R yukaidi1220/EEEOS-GET
gh run watch -R yukaidi1220/EEEOS-GET

# 3. 如果部署步失败提示 401/403：EDGEONE_API_TOKEN secret 已过期，去
#    EdgeOne 控制台重新生成并更新仓库 secret。
```

## 防复发：keepalive.yml

`GITHUB_TOKEN` 推的 commit 计入仓库活动、会重置 60 天时钟（keepalive-workflow 等
通行方案即此原理；GITHUB_TOKEN 推送不会触发其它工作流，无副作用）。每周一检查，
最后提交超过 45 天才推空提交，日志零噪音。keepalive 自身也是定时任务，它的空提交
就是活动来源，形成自持循环。

其他带 cron 的仓库（xrsys-maker 的 cleanup、MSUpdate 的 check）同理，MSUpdate 的
check 工作流会提交状态文件所以天然安全；xrsys-maker 若长期不改代码，需要时复制
这份 keepalive.yml 过去。
