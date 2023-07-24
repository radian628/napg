import { atleast, between, kleene, matchStr, str, union } from "../dist";
import { test, expect, describe } from "@jest/globals";

const testPattern = (
  patname: string,
  pat: number[],
  str: string,
  expected: boolean
) => {
  test(`against '${str}'`, () => {
    expect(matchStr(pat, str)).toEqual(expected);
  });
};

const testPatternWith = (
  patname: string,
  pat: number[],
  successes: string[],
  failures: string[]
) => {
  describe(`testing pattern '${patname}':`, () => {
    describe("should match ", () => {
      for (const str of successes) {
        testPattern(patname, pat, str, true);
      }
    });
    describe("should not match ", () => {
      for (const str of failures) {
        testPattern(patname, pat, str, false);
      }
    });
  });
};

describe("Pattern matching capabilities", () => {
  testPatternWith("a", str("a"), ["a"], ["b"]);

  testPatternWith("ab", str("ab"), ["ab", "abb", "aba"], ["a", "b", "ba"]);

  testPatternWith(
    "a*",
    kleene(str("a")),
    ["a", "b", "ab", "aaaaaaa", "aaaabbb", "aaa", "baaaaaa"],
    []
  );

  testPatternWith(
    "a|b",
    union("a", "b"),
    ["a", "b", "ab", "ac", "bc"],
    ["c", "cb"]
  );

  testPatternWith(
    "a{3,4}",
    between(3, 4, str("a")),
    ["aaa", "aaaa", "aaabbbb", "aaaab"],
    ["aabaaa", "aa", "a", "baaaaaa", "bbaaaaa"]
  );

  testPatternWith(
    "a+",
    atleast(1, str("a")),
    ["a", "aa", "aaa", "aaaa", "aaaaa", "aaaab"],
    ["b", "baaaa"]
  );
});
