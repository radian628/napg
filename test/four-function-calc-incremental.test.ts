import { test, expect, describe } from "@jest/globals";
import { evalFFC, ffcParser } from "./four-function-calc";
import { RopeLeaf, replace } from "../dist";

function rangeIntersect(
  start1: number,
  end1: number,
  start2: number,
  end2: number
) {
  return start1 <= end2 && end1 >= start2;
}

describe("incremental parsing test", () => {
  test("1 + 3 -> 1 + 2 + 3", () => {
    const rope = new RopeLeaf("1 + 3");
    const parser = ffcParser(rope.iter(0));

    const value = evalFFC(parser.exec(() => false));

    expect(value).toEqual(4);

    console.log("first eval done ");

    const updatedRope = replace(rope, 4, 4, new RopeLeaf("2 + ")).replacedRope;

    expect(updatedRope.str()).toEqual("1 + 2 + 3");
    expect(parser.position.rope.str()).toEqual("1 + ");

    const value2 = evalFFC(
      parser.exec((start, end) => {
        const startNum = start.index();
        const endNum = end.index();

        return rangeIntersect(startNum, endNum, 4, 8);
      })
    );

    expect(value2).toEqual(6);
  });

  test("(1 + 2 + 3) + 4 -> (1 + 2 + 5 + 3) + 4", () => {
    const rope = new RopeLeaf("(1 + 2 + 3) + 4");
    const parser = ffcParser(rope.iter(0));

    expect(evalFFC(parser.exec(() => false))).toEqual(10);

    const updatedRope = replace(rope, 6, 6, new RopeLeaf(" + 5")).replacedRope;

    expect(updatedRope.str()).toEqual("(1 + 2 + 5 + 3) + 4");
    expect(parser.position.rope.str()).toEqual("(1 + 2");

    const value2 = evalFFC(
      parser.exec((start, end) => {
        const startNum = start.index();
        const endNum = end.index();

        return rangeIntersect(startNum, endNum, 5, 10);
      })
    );

    expect(value2).toEqual(15);
  });
});
