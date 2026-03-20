# tmux 配置

Pi 在 tmux 中运行，但 tmux 默认会剥离某些按键的修饰键（modifier）信息。如果不进行配置，`Shift+Enter` 和 `Ctrl+Enter` 通常无法与普通的 `Enter` 区分开来。

## 推荐配置

添加到 `~/.tmux.conf`：

```tmux
set -g extended-keys on
set -g extended-keys-format csi-u
```

然后完全重启 tmux：

```bash
tmux kill-server
tmux
```

当 Kitty 键盘协议不可用时，Pi 会自动请求扩展键（extended keys）报告。通过设置 `extended-keys-format csi-u`，tmux 会以 CSI-u 格式转发带修饰键的按键，这是最可靠的配置。

## 为什么推荐 `csi-u`

如果只设置：

```tmux
set -g extended-keys on
```

tmux 默认使用 `extended-keys-format xterm`。当应用程序请求扩展键报告时，带修饰键的按键会以 xterm `modifyOtherKeys` 格式转发，例如：

- `Ctrl+C` → `\x1b[27;5;99~`
- `Ctrl+D` → `\x1b[27;5;100~`
- `Ctrl+Enter` → `\x1b[27;5;13~`

如果设置 `extended-keys-format csi-u`，同样的按键会转发为：

- `Ctrl+C` → `\x1b[99;5u`
- `Ctrl+D` → `\x1b[100;5u`
- `Ctrl+Enter` → `\x1b[13;5u`

Pi 支持这两种格式，但 `csi-u` 是推荐的 tmux 配置。

## 修复的问题

如果没有启用 tmux 扩展键，带修饰键的 Enter 键会退化为传统序列：

| 按键 | 无扩展键 | 使用 `csi-u` |
|-----|---------|--------------|
| Enter | `\r` | `\r` |
| Shift+Enter | `\r` | `\x1b[13;2u` |
| Ctrl+Enter | `\r` | `\x1b[13;5u` |
| Alt/Option+Enter | `\x1b\r` | `\x1b[13;3u` |

这会影响默认按键绑定（`Enter` 提交，`Shift+Enter` 换行）以及任何使用带修饰键的 Enter 的自定义按键绑定。

## 要求

- tmux 3.2 或更高版本（运行 `tmux -V` 检查）
- 支持扩展键的终端模拟器（Ghostty、Kitty、iTerm2、WezTerm、Windows Terminal）