import { test, expect, describe } from "@jest/globals";
import { evalFFC, parseFFC } from "./four-function-calc";

function ffcTest(code: string) {
  test(code, () => {
    const parserOutput = parseFFC(code);
    const expectedOutput = eval(code);
    expect(evalFFC(parserOutput)).toEqual(expectedOutput);
  });
}

describe("four function calc", () => {
  test("   123", () => {
    const parserOutput = parseFFC("   123");

    expect(evalFFC(parserOutput)).toEqual(123);
  });

  test(" 1 + 2 ", () => {
    const parserOutput = parseFFC(" 1 + 2 ");

    expect(evalFFC(parserOutput)).toEqual(3);
  });

  const testCases = [
    "    1 *2 + 3 ",
    "1+2",
    "  (1+   2)*3",
    "1   -2*  3  + 4",
    "1+2   -3   *4+   (  ( 5 +6)  * 3 * 4/ ( 2- 1 ))",
  ];

  for (const t of testCases) {
    ffcTest(t);
  }
});
