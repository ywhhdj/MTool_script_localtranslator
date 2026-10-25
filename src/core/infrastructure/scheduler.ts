/**
 * infrastructure/scheduler.ts — 定时器统一托管
 *
 * 方案：所有定时器都要登记到 Scheduler，dispose() 时全部清掉；
 *      debounce/throttle 额外返回 cancel()，并在 dispose 时自动取消。
 */

import { DisposableScope } from "../domain/disposable";
import type { Debounced, SchedulerPort } from "../domain/ports";

export class Scheduler implements SchedulerPort {
  private scope = new DisposableScope();
  private timers = new Set<ReturnType<typeof setTimeout>>();

  get size(): number {
    return this.timers.size;
  }

  timeout(fn: () => void, ms: number): () => void {
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
    const cancel = () => {
      if (this.timers.delete(id)) clearTimeout(id);
    };
    this.scope.add(cancel);
    return cancel;
  }

  interval(fn: () => void, ms: number): () => void {
    const id = setInterval(fn, ms);
    const cancel = () => clearInterval(id);
    this.timers.add(id as any);
    this.scope.add(() => {
      this.timers.delete(id as any);
      cancel();
    });
    return cancel;
  }

  debounce<T extends (...args: any[]) => void>(fn: T, ms: number): Debounced<T> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastArgs: any[] | null = null;

    const wrapped = ((...args: any[]) => {
      lastArgs = args;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const a = lastArgs || [];
        lastArgs = null;
        fn(...a);
      }, ms);
    }) as Debounced<T>;

    wrapped.cancel = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      lastArgs = null;
    };

    wrapped.flush = () => {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
      const a = lastArgs || [];
      lastArgs = null;
      fn(...a);
    };

    this.scope.add(() => wrapped.cancel());
    return wrapped;
  }

  throttle<T extends (...args: any[]) => void>(fn: T, ms: number): T & { cancel(): void } {
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending: any[] | null = null;

    const wrapped = ((...args: any[]) => {
      const now = Date.now();
      const remain = ms - (now - last);
      if (remain <= 0) {
        last = now;
        fn(...args);
        return;
      }
      pending = args;
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        last = Date.now();
        if (pending) fn(...pending);
        pending = null;
      }, remain);
    }) as T & { cancel(): void };

    wrapped.cancel = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    };

    this.scope.add(() => wrapped.cancel());
    return wrapped;
  }

  dispose(): void {
    for (const id of this.timers) {
      clearTimeout(id);
      clearInterval(id as any);
    }
    this.timers.clear();
    this.scope.dispose();
  }
}
