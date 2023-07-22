export type Rope = RopeBranch | RopeLeaf;

export class RopeLeaf {
  data: string;
  parent?: RopeBranch;

  get countToLeft() {
    return this.data.length;
  }

  constructor(data: string) {
    this.data = data;
  }

  concat(r: Rope) {
    const root = new RopeBranch(this, r);
    return root;
  }

  at(idx: number) {
    return this.data[idx];
  }

  iter(idx: number): RopeIter {
    return new RopeIter(this, idx);
  }

  startIndex() {
    return this.parent?.startIndex() ?? 0;
  }

  split(idx: number): [RopeLeaf, RopeLeaf] {
    return [
      new RopeLeaf(this.data.slice(0, idx)),
      new RopeLeaf(this.data.slice(idx)),
    ];
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
  rope: RopeLeaf;
  pos: number;

  constructor(rope: RopeLeaf, pos: number) {
    this.rope = rope;
    this.pos = pos;
  }

  read(n: number): [string, RopeIter] {
    const nextIter = new RopeIter(this.rope, this.pos);

    let readString = "";
    while (n > 0) {
      const unrestrictedRemainingCount =
        nextIter.rope.str().length - nextIter.pos;
      const remainingCount = Math.min(n, unrestrictedRemainingCount);
      readString += nextIter.rope
        .str()
        .slice(nextIter.pos, remainingCount + nextIter.pos);
      nextIter.pos = remainingCount + nextIter.pos;
      n -= remainingCount;

      if (n > 0) {
        nextIter.pos = 0;
        const nextLeaf = nextIter.rope.nextLeaf();
        if (!nextLeaf) {
          nextIter.pos = nextIter.rope.str().length;
          break;
        }
        nextIter.rope = nextLeaf;
      }
    }

    return [readString, nextIter];
  }

  prev(n: number): RopeIter {
    const prevIter = new RopeIter(this.rope, this.pos);

    while (n > 0) {
      const remaining = prevIter.pos;
      if (remaining >= n) {
        prevIter.pos -= n;
        n = 0;
      } else {
        n -= prevIter.pos;
        const prevLeaf = prevIter.rope.prevLeaf();
        if (!prevLeaf) {
          prevIter.pos = 0;
          break;
        }
        prevIter.rope = prevLeaf;
        prevIter.pos = prevIter.rope.str().length - 1;
      }
    }

    return prevIter;
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
