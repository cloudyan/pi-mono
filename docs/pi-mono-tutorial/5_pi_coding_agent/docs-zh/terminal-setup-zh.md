# 终端设置

Pi 使用 [Kitty 键盘协议](https://sw.kovidgoyal.net/kitty/keyboard-protocol/) 来实现可靠的修饰键检测。大多数现代终端都支持此协议，但有些终端需要进行配置。

## Kitty、iTerm2

开箱即用。

## Ghostty

添加到你的 Ghostty 配置文件中（macOS 上为 `~/Library/Application Support/com.mitchellh.ghostty/config`，Linux 上为 `~/.config/ghostty/config`）：

```
keybind = alt+backspace=text:\x1b\x7f
```

旧版 Claude Code 可能添加过这个 Ghostty 映射：

```
keybind = shift+enter=text:\n
```

该映射发送原始换行字节。在 pi 内部，这与 `Ctrl+J` 无法区分，因此 tmux 和 pi 无法再识别真正的 `shift+enter` 按键事件。

如果你添加该映射仅仅是为了使用 Claude Code 2.x 或更新版本，可以将其移除，除非你想在 tmux 中使用 Claude Code，这种情况下仍需要该 Ghostty 映射。

如果你希望通过该重映射让 `Shift+Enter` 在 tmux 中继续工作，请在 `~/.pi/agent/keybindings.json` 中将 `ctrl+j` 添加到 pi 的 `newLine` 快捷键绑定中：

```json
{
  "newLine": ["shift+enter", "ctrl+j"]
}
```

## WezTerm

创建 `~/.wezterm.lua`：

```lua
local wezterm = require 'wezterm'
local config = wezterm.config_builder()
config.enable_kitty_keyboard = true
return config
```

## VS Code（集成终端）

`keybindings.json` 文件位置：
- macOS：`~/Library/Application Support/Code/User/keybindings.json`
- Linux：`~/.config/Code/User/keybindings.json`
- Windows：`%APPDATA%\\Code\\User\\keybindings.json`

添加到 `keybindings.json` 以启用 `Shift+Enter` 进行多行输入：

```json
{
  "key": "shift+enter",
  "command": "workbench.action.terminal.sendSequence",
  "args": { "text": "\u001b[13;2u" },
  "when": "terminalFocus"
}
```

## Windows Terminal

添加到 `settings.json`（按 Ctrl+Shift+, 或通过 设置 → 打开 JSON 文件）以转发 pi 使用的修饰 Enter 键：

```json
{
  "actions": [
    {
      "command": { "action": "sendInput", "input": "\u001b[13;2u" },
      "keys": "shift+enter"
    },
    {
      "command": { "action": "sendInput", "input": "\u001b[13;3u" },
      "keys": "alt+enter"
    }
  ]
}
```

- `Shift+Enter` 插入新行。
- Windows Terminal 默认将 `Alt+Enter` 绑定到全屏功能。这会阻止 pi 接收用于后续消息排队的 `Alt+Enter`。
- 将 `Alt+Enter` 重映射为 `sendInput` 会将真实的组合键转发给 pi。

如果你已有 `actions` 数组，请将对象添加到其中。如果旧的全屏行为仍然存在，请完全关闭并重新打开 Windows Terminal。

## xfce4-terminal、terminator

这些终端对转义序列的支持有限。`Ctrl+Enter` 和 `Shift+Enter` 等修饰 Enter 键无法与普通 `Enter` 区分开来，导致 `submit: ["ctrl+enter"]` 等自定义快捷键绑定无法正常工作。

为获得最佳体验，请使用支持 Kitty 键盘协议的终端：
- [Kitty](https://sw.kovidgoyal.net/kitty/)
- [Ghostty](https://ghostty.org/)
- [WezTerm](https://wezfurlong.org/wezterm/)
- [iTerm2](https://iterm2.com/)
- [Alacritty](https://github.com/alacritty/alacritty)（需要编译时启用 Kitty 协议支持）

## IntelliJ IDEA（集成终端）

内置终端对转义序列的支持有限。在 IntelliJ 的终端中，Shift+Enter 无法与 Enter 区分开来。

如果你希望显示硬件光标，请在运行 pi 之前设置 `PI_HARDWARE_CURSOR=1`（默认禁用以保证兼容性）。

建议使用专门的终端模拟器以获得最佳体验。