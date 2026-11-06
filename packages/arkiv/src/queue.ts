/**
 * One write queue per signer (CLAUDE.md §5 write rules). Two in-flight transactions from one wallet race on the
 * nonce; different signers never wait for each other. A failed job rejects its own caller and the queue moves on.
 */
export class SignerQueue {
  private readonly tails = new Map<string, Promise<unknown>>();

  run<T>(signer: string, job: () => Promise<T>): Promise<T> {
    const key = signer.toLowerCase();
    const prev = this.tails.get(key) ?? Promise.resolve();
    const result = prev.then(job, job);
    const tail = result.catch(() => undefined);
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return result;
  }
}
