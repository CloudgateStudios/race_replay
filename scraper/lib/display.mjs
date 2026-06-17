/**
 * Manages a growing list of terminal lines where each line can be updated
 * in place via targeted ANSI cursor movement.
 *
 * Falls back to plain console.log when stdout is not a TTY.
 */
export class ProgressDisplay {
  constructor() {
    this._lines = [];
    this._rendered = 0;
    this._tty = process.stdout.isTTY ?? false;
  }

  /** Appends a new line and returns its index for use with update(). */
  addLine(text) {
    const i = this._lines.length;
    this._lines.push(text);
    if (this._tty) {
      process.stdout.write(`${text}\n`);
      this._rendered = this._lines.length;
    } else {
      console.log(text);
    }
    return i;
  }

  /** Rewrites a previously added line in place. */
  update(i, text) {
    this._lines[i] = text;
    if (!this._tty) {
      console.log(text);
      return;
    }
    const up = this._rendered - i;
    process.stdout.write(`\x1b[${up}A`);
    process.stdout.write(`\r\x1b[K${text}`);
    process.stdout.write(`\x1b[${up}B\r`);
  }
}
