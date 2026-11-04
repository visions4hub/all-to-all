import { describe, expect, it } from "vitest";
import { createLimiter } from "./limit";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("createLimiter", () => {
  it("never runs more than max jobs at once, and runs them all in order", async () => {
    const limit = createLimiter(2);
    let running = 0;
    let most = 0;
    const started: number[] = [];
    const jobs = Array.from({ length: 6 }, (_, i) =>
      limit(async () => {
        started.push(i);
        running++;
        most = Math.max(most, running);
        await tick();
        running--;
        return i * 10;
      }),
    );
    expect(await Promise.all(jobs)).toEqual([0, 10, 20, 30, 40, 50]);
    expect(most).toBe(2);
    expect(started).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("a failing job (thrown or rejected) frees its slot", async () => {
    const limit = createLimiter(1);
    const a = limit(() => {
      throw new Error("sync");
    });
    const b = limit(() => Promise.reject(new Error("async")));
    const c = limit(async () => "ok");
    await expect(a).rejects.toThrow("sync");
    await expect(b).rejects.toThrow("async");
    expect(await c).toBe("ok");
  });
});
