export class HashTable<K, V, InternalKey = string | number | symbol | boolean> {
  hash: (k: K) => InternalKey;
  eq: (a: K, b: K) => boolean;
  data: Map<InternalKey, [K, V][]>;

  constructor(hash: (k: K) => InternalKey, eq: (a: K, b: K) => boolean) {
    this.hash = hash;
    this.eq = eq;
    this.data = new Map();
  }

  get(k: K) {
    return this.data.get(this.hash(k))?.find(([k2]) => this.eq(k, k2))?.[1];
  }

  set(k: K, v: V) {
    const hashk = this.hash(k);

    let arr = this.data.get(hashk);
    if (!arr) {
      arr = [];
      this.data.set(hashk, arr);
    }

    arr?.push([k, v]);

    return arr;
  }

  delete(k: K) {
    const hashk = this.hash(k);

    const arr = this.data.get(hashk);

    if (!arr) return false;

    const removed = arr?.filter((e) => !this.eq(k, e[0]));

    if (removed.length > 0) {
      this.data.set(hashk, removed);
    } else {
      this.data.delete(hashk);
    }

    return arr.length != removed.length;
  }
}
