# Shell 别名

Pi 以非交互模式运行 bash (`bash -c`)，默认情况下不会展开别名（aliases）。

要启用你的 Shell 别名，请在 `~/.pi/agent/settings.json` 中添加：

```json
{
  "shellCommandPrefix": "shopt -s expand_aliases\neval \"$(grep '^alias ' ~/.zshrc)\""
}
```

根据你的 Shell 配置文件调整路径（如 `~/.zshrc`、`~/.bashrc` 等）。