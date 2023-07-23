import { Rope, RopeBranch, RopeIterMut, RopeLeaf, replace } from "../dist";
import { test, expect } from "@jest/globals";

test("Rope iterator", () => {
  const rope = new RopeLeaf("test");

  expect(rope.iter(0).read(4)[0]).toEqual("test");
});

const rl = (str: string) => new RopeLeaf(str);

test("Rope concat", () => {
  const a = rl("hello");
  const b = rl("world");

  const concatted = a.concat(b);

  expect(concatted.str()).toEqual("helloworld");
});

test("Rope split", () => {
  const rope = rl("foobar");

  const [a, b] = rope.split(3);

  expect(a.str()).toEqual("foo");
  expect(b.str()).toEqual("bar");
});

test("Traverse a split-up rope", () => {
  const originalRope = rl("the quick brown fox jumped over the lazy dog");

  // figure out where the spaces are
  let rope: Rope = originalRope;
  const spacePositions = Array.from(rope.str().matchAll(/ /g)).map(
    (e) => e.index as number
  );
  // split at spaces
  for (const p of spacePositions) {
    const [a, b] = rope.split(p);
    rope = a.concat(b);
  }

  // check to see if each leaf contains the correct content
  const str = originalRope.str();
  let leaf: RopeLeaf | undefined = rope.iter(0).rope;
  let first = true;
  for (const substrWithoutSpace of str.split(" ")) {
    const substr = (first ? "" : " ") + substrWithoutSpace;
    expect(leaf?.str()).toEqual(substr);
    leaf = leaf?.nextLeaf();
    first = false;
  }

  // make sure the rope still has the original string
  expect(rope.str()).toEqual(str);

  // try to retrieve the original string with an iterator
  const iter = new RopeIterMut(rope.iter(0));
  let iterStr = "";
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const substr = iter.read(3);
    iterStr += substr;
    if (substr.length != 3) break;
  }
  expect(iterStr).toEqual(str);

  // rewind the iterator back to the beginning
  for (let i = 0; i < Math.ceil(str.length / 3); i++) {
    iter.prev(3);
  }

  // try it again to make sure rewind worked
  let iterStr2 = "";
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const substr = iter.read(3);
    iterStr2 += substr;
    if (substr.length != 3) break;
  }
  expect(iterStr2).toEqual(str);
});

test("Retain iter position after split", () => {
  const originalRope = rl("012345");

  const iterLeft = originalRope.iter(1);
  const iterRight = originalRope.iter(4);

  new RopeBranch(...originalRope.split(3));

  expect(iterLeft.index()).toEqual(1);
  expect(iterRight.index()).toEqual(4);
});

test("Retain iterator position after replacing range", () => {
  const originalRope = rl("foo123bar");

  // create an iterator to the 7th char of the rope
  const iter = originalRope.iter(7);
  const iterIndex = iter.index();

  // replace '123' with ' ', effectively removing two characters
  const replacedRopes = replace(originalRope, 3, 6, rl(" "));

  expect(replacedRopes.replacedRope.str()).toEqual("foo bar");

  expect(replacedRopes.removedSection.str()).toEqual("123");

  // index should now be two less vs before since the rope is shorter
  const newIterIndex = iter.index();
  expect(newIterIndex).toEqual(iterIndex - 2);
});
