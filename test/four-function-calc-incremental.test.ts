import { test, expect, describe } from "@jest/globals";
import { evalFFC, ffcParser } from "./four-function-calc";
import { LivingDocument } from "../dist";

describe("incremental parsing test", () => {
  test("1 + 3 -> 1 + 2 + 3", () => {
    const doc = new LivingDocument("1 + 3", (iter) => ffcParser(iter));

    expect(evalFFC(doc.parse())).toEqual(4);

    doc.replace(3, 3, " 2 +");

    expect(evalFFC(doc.parse())).toEqual(6);
  });

  test("(1 + 2 + 3) + (4 + 4) -> (1 + 2 + 5 + 3) + (4 + 4)", () => {
    const doc = new LivingDocument("(1 + 2 + 3) + (4 + 4)", (iter) =>
      ffcParser(iter)
    );
    expect(evalFFC(doc.parse())).toEqual(14);

    doc.replace(6, 6, " + 5");

    expect(evalFFC(doc.parse())).toEqual(19);
  });
});
