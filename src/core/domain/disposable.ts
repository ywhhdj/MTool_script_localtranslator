/**
 * domain/disposable.ts — 资源释放契约
 *
 * 所有 Hook、定时器、监听器、订阅统一登记到 DisposableScope，
 * 由 container.dispose() 一次性回收，避免「面板关了但定时器还在跑」这类泄漏。
 */

export interface Disposable {
  dispose(): void;
}

export type Disposer = () => void;

export function isDisposable(value: unknown): value is Disposable {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Disposable).dispose === "function"
  );
}

export class DisposableScope implements Disposable {
  private disposers = new Set<Disposer>();
  private _disposed = false;

  get disposed(): boolean {
    return this._disposed;
  }

  get size(): number {
    return this.disposers.size;
  }

  /** 登记任意可释放资源（Disposable 对象或纯函数） */
  add(resource: Disposable | Disposer | null | undefined): Disposer {
    if (!resource) return () => {};
    const disposer: Disposer = isDisposable(resource)
      ? () => {
          try {
            resource.dispose();
          } catch {
            /* 释放阶段不再抛错 */
          }
        }
      : resource;
    if (this._disposed) {
      disposer();
      return () => {};
    }
    this.disposers.add(disposer);
    return () => this.remove(disposer);
  }

  remove(disposer: Disposer): void {
    this.disposers.delete(disposer);
  }

  /** 释放并清空；可重复调用 */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    const list = Array.from(this.disposers);
    this.disposers.clear();
    for (let i = list.length - 1; i >= 0; i--) {
      try {
        list[i]();
      } catch {
        /* ignore */
      }
    }
  }
}
