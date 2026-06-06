/**
 * @deepwhale/tui-ink — CircularBuffer 工具 (D-26 C1, 跟 Hermes ui-tui 对齐).
 *
 * 跟 Hermes ui-tui/src/lib/circularBuffer.ts 1:1 同形态 (容量固定, push O(1),
 * tail/drain O(n), 头插尾取). 用途: D-28 composer 状态机 queue + D-29 turn state
 * machine tool trail (D-26 C1 拍"先建 lib, 后续 sprint 用").
 *
 * 业务 0 改, 1:1 抄 Hermes 48 行, 加:
 *   - JSDoc 中文拍板 (D-25 拍板风格)
 *   - capacity 必填 + RangeError 验证 (Hermes 已有, JSDoc 强化)
 */

export class CircularBuffer<T> {
  private buf: T[]
  private head = 0
  private len = 0

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError(`CircularBuffer capacity must be a positive integer, got ${capacity}`)
    }
    this.buf = new Array<T>(capacity)
  }

  /** O(1) push, 满则覆盖最老. 跟 Hermes 1:1. */
  push(item: T): void {
    this.buf[this.head] = item
    this.head = (this.head + 1) % this.capacity
    if (this.len < this.capacity) {
      this.len++
    }
  }

  /** 取末尾 n 条 (默认全取), 顺序: 最早 → 最新. 跟 Hermes 1:1. */
  tail(n: number = this.len): T[] {
    const take = Math.min(Math.max(0, n), this.len)
    const start = this.len < this.capacity ? 0 : this.head
    const out: T[] = new Array<T>(take)
    for (let i = 0; i < take; i++) {
      out[i] = this.buf[(start + this.len - take + i) % this.capacity]!
    }
    return out
  }

  /** 取全部 + 清空. 跟 Hermes 1:1. */
  drain(): T[] {
    const out = this.tail()
    this.clear()
    return out
  }

  /** 清空 (重置 head + len, 不释放 buf). 跟 Hermes 1:1. */
  clear(): void {
    this.buf = new Array<T>(this.capacity)
    this.head = 0
    this.len = 0
  }

  /** 当前长度. Hermes 没显式 export, D-26 补 (测断言用). */
  get size(): number {
    return this.len
  }

  /** 容量. Hermes 没显式 export, D-26 补 (测断言用). */
  get capacityValue(): number {
    return this.capacity
  }
}
