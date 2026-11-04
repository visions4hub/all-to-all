/**
 * Runs async jobs with at most `max` running at once, in the order they were
 * queued. Used to cap how many large files are decoded at the same time.
 */
export function createLimiter(max: number) {
  let running = 0;
  const waiting: (() => void)[] = [];
  const next = () => {
    running--;
    waiting.shift()?.();
  };
  return function run<T>(job: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        running++;
        let result: Promise<T>;
        try {
          result = job();
        } catch (error) {
          result = Promise.reject(error);
        }
        result.then(resolve, reject).finally(next);
      };
      if (running < max) start();
      else waiting.push(start);
    });
  };
}
