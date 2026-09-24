// Neon palette and glow helpers shared by every renderer.
import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";

export interface StyleTheme {
  fg?: (color: ThemeColor, text: string) => string;
  bg?: (color: Parameters<Theme["bg"]>[0], text: string) => string;
  bold?: (text: string) => string;
  italic?: (text: string) => string;
  underline?: (text: string) => string;
}

// Linkarzu theme colors from mozek_rust
export const LINKARZU_TODO = "\x1b[38;2;249;77;255m";

 // #f94dff (vivid pink)
export const LINKARZU_WORKING = "\x1b[38;2;241;252;121m";

 // #f1fc79 (electric yellow)
export const LINKARZU_WAITING = "\x1b[38;2;152;122;251m";

 // #987afb (neon violet/purple)
export const LINKARZU_DONE = "\x1b[38;2;55;244;153m";

 // #37f499 (neon mint green)
export const LINKARZU_CANCELLED = "\x1b[38;2;135;145;170m";

 // #5f6b8a (slate grey)
export const LINKARZU_CYAN = "\x1b[38;2;4;209;249m";

 // #04d1f9 (neon cyan / accent)
export const LINKARZU_CORAL = "\x1b[38;2;241;108;117m";

 // #f16c75 (coral / danger)
export const LINKARZU_BORDER = "\x1b[38;2;60;75;105m";

export function pinkGlow(text: string): string {
  return `${LINKARZU_TODO}${text}\x1b[39m`;
}

export function cyanGlow(text: string): string {
  return `${LINKARZU_CYAN}${text}\x1b[39m`;
}

export function greenGlow(text: string): string {
  return `${LINKARZU_DONE}${text}\x1b[39m`;
}

export function goldGlow(text: string): string {
  return `${LINKARZU_WORKING}${text}\x1b[39m`;
}

export function coralGlow(text: string): string {
  return `${LINKARZU_CORAL}${text}\x1b[39m`;
}

export function violetGlow(text: string): string {
  return `${LINKARZU_WAITING}${text}\x1b[39m`;
}

export function slateGlow(text: string): string {
  return `${LINKARZU_CANCELLED}${text}\x1b[39m`;
}

export function dividerGlow(text: string): string {
  return `${LINKARZU_BORDER}${text}\x1b[39m`;
}

export function defaultBold(text: string): string {
  return `\x1b[1m${text}\x1b[22m`;
}

export function defaultItalic(text: string): string {
  return `\x1b[3m${text}\x1b[23m`;
}

export function defaultUnderline(text: string): string {
  return `\x1b[4m${text}\x1b[24m`;
}

export function resolveTheme(theme?: StyleTheme): Required<StyleTheme> {
  return {
    fg: (color, text) => (theme?.fg ? theme.fg(color, text) : pinkGlow(text)),
    bg: (color, text) => (theme?.bg ? theme.bg(color, text) : text),
    bold: (text) => (theme?.bold ? theme.bold(text) : defaultBold(text)),
    italic: (text) =>
      theme?.italic ? theme.italic(text) : defaultItalic(text),
    underline: (text) =>
      theme?.underline ? theme.underline(text) : defaultUnderline(text),
  };
}
