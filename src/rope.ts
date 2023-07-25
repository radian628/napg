export type Rope = RopeBranch | RopeLeaf;

export class RopeLeaf {
  static id = 0;

  data: string;
  parent?: RopeBranch;
  iters: Map<number, WeakRef<RopeIter>>;
  hashid = RopeLeaf.id++;

  get countToLeft() {
    return this.data.length;
  }

  constructor(data: string) {
    this.data = data;
    this.iters = new Map();
  }

  purgeDeadIterators() {
    for (const [k, v] of this.iters.entries()) {
      if (v.deref() === undefined) {
        this.iters.delete(k);
      }
    }
  }

  concat(r: Rope) {
    const root = new RopeBranch(this, r);
    return root;
  }

  at(idx: number) {
    return this.data[idx];
  }

  iter(idx: number): RopeIter {
    const existingIter = this.iters.get(idx)?.deref();
    if (existingIter) return existingIter;
    const iter = new RopeIter(this, idx);
    return iter;
  }

  startIndex(): number {
    const parent = this.parent;

    if (!parent) return 0;

    const parentStartIndex = parent.startIndex();
    // this is a left child
    if (parent.left === this) {
      return parentStartIndex;
      // this is a right child
    } else {
      return parentStartIndex + parent.countToLeft;
    }
  }

  split(idx: number): [RopeLeaf, RopeLeaf] {
    const left = new RopeLeaf(this.data.slice(0, idx));
    left.hashid = this.hashid;
    const right = new RopeLeaf(this.data.slice(idx));
    right.hashid = this.hashid;

    this.purgeDeadIterators();

    for (const iterRef of this.iters.values()) {
      const iter = iterRef.deref() as RopeIter;
      if (iter.pos >= idx) {
        iter.moveRef(right, iter.pos - idx);
      } else {
        iter.moveRef(left, iter.pos);
      }
    }

    return [left, right];
  }

  shallowCopy() {
    return new RopeLeaf(this.data);
  }

  str() {
    return this.data;
  }

  nextLeaf(): RopeLeaf | undefined {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let rope: Rope | undefined = this;

    // go up the tree until the current node is a left child
    while (rope === rope?.parent?.right) {
      rope = rope.parent;
    }

    // go right once and then left as many times as possible
    // in order to reach the next leaf
    rope = rope.parent;
    if (rope) {
      rope = rope.right;
      while (!(rope instanceof RopeLeaf)) {
        rope = rope.left;
      }
      return rope;
    }
  }

  prevLeaf(): RopeLeaf | undefined {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let rope: Rope | undefined = this;

    // go up the tree until the current node is a right child
    while (rope === rope?.parent?.left) {
      rope = rope.parent;
    }

    // go left once and then right as many times as possible
    // in order to reach the prev leaf
    rope = rope.parent;
    if (rope) {
      rope = rope.left;
      while (!(rope instanceof RopeLeaf)) {
        rope = rope.right;
      }
      return rope;
    }
  }
}

export class RopeBranch {
  left: Rope;
  right: Rope;
  countToLeft: number;
  parent?: RopeBranch;
  data?: undefined;

  constructor(left: Rope, right: Rope) {
    this.left = left;
    if (left) left.parent = this;

    this.right = right;
    if (right) right.parent = this;

    this.countToLeft = 0;
    let nodeToSum = left;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      this.countToLeft += nodeToSum.countToLeft;
      if (typeof nodeToSum.data !== "string") {
        nodeToSum = nodeToSum.right;
      } else {
        break;
      }
    }
  }

  shallowCopy() {
    return new RopeBranch(this.left, this.right);
  }

  concat(r: Rope) {
    const root = new RopeBranch(this, r);
    return root;
  }

  at(idx: number): string | undefined {
    if (idx < this.countToLeft) {
      return this.left.at(idx);
    } else {
      return this.right.at(idx - this.countToLeft);
    }
  }

  iter(idx: number): RopeIter {
    if (idx < this.countToLeft) {
      return this.left.iter(idx);
    } else {
      return this.right.iter(idx - this.countToLeft);
    }
  }

  startIndex(): number {
    const parent = this.parent;

    if (!parent) return 0;

    const parentStartIndex = parent.startIndex();
    // this is a left child
    if (parent.left === this) {
      return parentStartIndex;
      // this is a right child
    } else {
      return parentStartIndex + parent.countToLeft;
    }
  }

  split(idx: number): [Rope, Rope] {
    if (idx < this.countToLeft) {
      const [first, second] = this.left.split(idx);
      return [first, new RopeBranch(second, this.right)];
    } else if (idx > this.countToLeft) {
      const [first, second] = this.right.split(idx - this.countToLeft);
      return [new RopeBranch(this.left, first), second];
    } else {
      return [this.left, this.right];
    }
  }

  str(): string {
    return this.left.str() + this.right.str();
  }
}

/**
 * Replace a section of a rope with another rope.
 * @param rope - Rope to replace.
 * @param start - start index to do the replacement.
 * @param end - End index to do the replacement.
 * @param replacement - Rope to insert as the replacement.
 * @returns An object containing the rope with the replacement applied (`replacedRope`)
 * and the section that was removed (`removedSection`).
 */
export function replace(
  rope: Rope,
  start: number,
  end: number,
  replacement: Rope
) {
  const [left, rightAndMiddle] = rope.split(start);
  const [middle, right] = rightAndMiddle.split(end - start);
  return {
    replacedRope: left.concat(replacement).concat(right),
    removedSection: middle,
  };
}

export class RopeIter {
  static id = 0;

  rope: RopeLeaf;
  pos: number;
  id: number;

  constructor(rope: RopeLeaf, pos: number) {
    this.rope = rope;
    this.pos = pos;
    this.id = RopeIter.id++;
    this.rope.iters.set(this.pos, new WeakRef(this));
  }

  index() {
    return this.pos + this.rope.startIndex();
  }

  equals(iter: RopeIter) {
    return this.rope === iter.rope && this.pos === iter.pos;
  }

  hash() {
    return this.id;
  }

  moveRef(newRope: RopeLeaf, idx: number) {
    this.rope.iters.delete(this.pos);
    newRope.iters.set(idx, new WeakRef(this));
    this.rope = newRope;
    this.pos = idx;
  }

  read(n: number): [string, RopeIter] {
    let nextIterRope = this.rope;
    let nextIterPos = this.pos;

    let readString = "";
    while (n > 0) {
      const unrestrictedRemainingCount =
        nextIterRope.str().length - nextIterPos;
      const remainingCount = Math.min(n, unrestrictedRemainingCount);
      readString += nextIterRope
        .str()
        .slice(nextIterPos, remainingCount + nextIterPos);
      nextIterPos = remainingCount + nextIterPos;
      n -= remainingCount;

      if (n > 0) {
        nextIterPos = 0;
        const nextLeaf = nextIterRope.nextLeaf();
        if (!nextLeaf) {
          nextIterPos = nextIterRope.str().length;
          break;
        }
        nextIterRope = nextLeaf;
      }
    }

    return [readString, nextIterRope.iter(nextIterPos)];
  }

  prev(n: number): RopeIter {
    let prevIterRope = this.rope;
    let prevIterPos = this.pos;

    while (n > 0) {
      const remaining = prevIterPos;
      if (remaining >= n) {
        prevIterPos -= n;
        n = 0;
      } else {
        n -= prevIterPos;
        const prevLeaf = prevIterRope.prevLeaf();
        if (!prevLeaf) {
          prevIterPos = 0;
          break;
        }
        prevIterRope = prevLeaf;
        prevIterPos = prevIterRope.str().length - 1;
      }
    }

    return prevIterRope.iter(prevIterPos);
  }
}

export class RopeIterMut {
  iter: RopeIter;

  constructor(iter: RopeIter) {
    this.iter = iter;
  }

  read(n: number) {
    const [readString, nextIter] = this.iter.read(n);
    this.iter = nextIter;

    return readString;
  }

  prev(n: number) {
    const prevIter = this.iter.prev(n);
    this.iter = prevIter;
  }
}

/**
 * Get the root node of a rope node.
 * @param rope - Rope for which to get the root node.
 * @returns The root node.
 */
export function root(rope: Rope) {
  while (rope.parent) {
    rope = rope.parent;
  }
  return rope;
}
