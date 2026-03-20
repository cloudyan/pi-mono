# Windows 设置

Pi 在 Windows 上需要 bash shell。按以下顺序检查位置：

1. 来自 `~/.pi/agent/settings.json` 的自定义路径
2. Git Bash (`C:\Program Files\Git\bin\bash.exe`)
3. PATH 中的 `bash.exe`（Cygwin、MSYS2、WSL）

对于大多数用户，[Git for Windows](https://git-scm.com/download/win) 就足够了。

## 自定义 Shell 路径

```json
{
  "shellPath": "C:\\cygwin64\\bin\\bash.exe"
}
```