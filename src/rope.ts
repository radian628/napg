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
    return {
      index: idx,
      node: this,
    };
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
    while (typeof nodeToSum.data !== "string") {
      this.countToLeft += nodeToSum.countToLeft;
      nodeToSum = nodeToSum.right;
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
      const [first, second] = this.right.split(idx);
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

export type RopeIter = {
  index: number;
  node: RopeLeaf;
};
