import { compilePattern, matchStr } from "../dist";
import { test, expect, describe } from "@jest/globals";

const testPattern = (
  patname: string,
  pat: number[],
  str: string,
  expected: number | undefined
) => {
  test(`against '${str}'`, () => {
    const matchRes = matchStr(pat, str);
    if (expected === undefined) {
      expect(matchRes).toEqual(expected);
    } else {
      expect(typeof matchRes).toEqual("number");
    }
  });
};

const testPatternWith = (
  patname: string,
  successes: string[],
  failures: string[]
) => {
  const pat = compilePattern(patname);
  describe(`testing pattern '${patname}':`, () => {
    describe("should match ", () => {
      for (const str of successes) {
        testPattern(patname, pat, str, 1);
      }
    });
    describe("should not match ", () => {
      for (const str of failures) {
        testPattern(patname, pat, str, undefined);
      }
    });
  });
};

describe("Pattern matching capabilities", () => {
  testPatternWith("a", ["a"], ["b"]);

  testPatternWith("ab", ["ab", "abb", "aba"], ["a", "b", "ba"]);

  testPatternWith(
    "a*",
    ["a", "b", "ab", "aaaaaaa", "aaaabbb", "aaa", "baaaaaa"],
    []
  );

  testPatternWith("a|b", ["a", "b", "ab", "ac", "bc"], ["c", "cb"]);

  testPatternWith(
    "a{3,4}",
    ["aaa", "aaaa", "aaabbbb", "aaaab"],
    ["aabaaa", "aa", "a", "baaaaaa", "bbaaaaa"]
  );

  testPatternWith(
    "a+",
    ["a", "aa", "aaa", "aaaa", "aaaaa", "aaaab"],
    ["b", "baaaa"]
  );

  testPatternWith("(a|b)+", ["a", "b", "ab", "bab", "aba", "ba"], ["cba", "c"]);

  testPatternWith(
    "[0-9]+",
    [
      "123123",
      "092845",
      "109289347",
      "12",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "0",
      "19034a",
    ],
    ["bfdkjglgf", "lasaskdjfad", "-dslklgn"]
  );

  testPatternWith(
    "(a|b)(c|d)",
    ["ac", "ad", "bc", "bd"],
    ["cd", "ab", "da", "cb"]
  );

  testPatternWith("%+", ["+"], ["%"]);

  testPatternWith(
    "[a-cA-C]",
    ["a", "b", "c", "A", "B", "C"],
    ["d", "D", "%[", "`"]
  );

  testPatternWith("[abc]", ["a", "b", "c"], ["d", "e", "f"]);
});
