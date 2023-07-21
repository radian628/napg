import { position } from "../dist";

import { test, expect, describe } from "@jest/globals";
import {
  PositionedNode,
  expressionParselet,
  ffcParser,
} from "./four-function-calc";

function parseFFC(src: string) {
  const parser = ffcParser(src);

  const parserOutput = parser.parse(expressionParselet, {
    bindingPower: 0,
  });

  return parserOutput[0];
}

function evalFFC(tree: PositionedNode): number {
  switch (tree.type) {
    case "Number":
      return tree.number;
    case "BinaryOp":
      {
        const l = evalFFC(tree.left);
        const r = evalFFC(tree.right);
        switch (tree.op) {
          case "+":
            return l + r;
          case "-":
            return l - r;
          case "*":
            return l * r;
          case "/":
            return l / r;
        }
      }
      break;
    case "Error":
      return NaN;
  }
}

function ffcTest(code: string) {
  test(code, () => {
    const parserOutput = parseFFC(code);
    const expectedOutput = eval(code);
    expect(evalFFC(parserOutput)).toEqual(expectedOutput);
  });
}

describe("four function calc", () => {
  test("123", () => {
    const parserOutput = parseFFC("123");

    expect(evalFFC(parserOutput)).toEqual(123);

    expect(parserOutput).toEqual({
      type: "Number",
      number: 123,
      [position]: {
        start: 0,
        end: 3,
      },
    });
  });

  test("1+2", () => {
    const parserOutput = parseFFC("1+2");

    expect(evalFFC(parserOutput)).toEqual(3);

    expect(parserOutput).toEqual({
      type: "BinaryOp",
      left: {
        type: "Number",
        number: 1,
        [position]: {
          start: 0,
          end: 1,
        },
      },
      right: {
        type: "Number",
        number: 2,
        [position]: {
          start: 2,
          end: 3,
        },
      },
      op: "+",
      [position]: {
        start: 0,
        end: 3,
      },
    });
  });

  const testCases = [
    "1*2+3",
    "1+2*3",
    "(1+2)*3",
    "1-2*3+4",
    "1+2-3*4+((5+6)*3*4/(2-1))",
  ];

  for (const t of testCases) {
    ffcTest(t);
  }

  console.log(parseFFC("1+(2*6"));
});
