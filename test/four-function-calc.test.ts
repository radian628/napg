import {
  MutableParserInterface,
  Parselet,
  Positioned,
  Token,
  lexerFromString,
  parselet,
  parserFromLexer,
  position,
  token,
} from "../dist";

import { test, expect, describe } from "@jest/globals";

const simpleToken = <T extends string>(
  symbol: T | readonly T[] | RegExp,
  name: string
): Token<TokenSuccess<T>, string> => {
  return token((lexer) => {
    const match = lexer.match(symbol);
    if (match === undefined) lexer.err(`Expected a ${name}.`);
    return {
      type: "Success",
      match: match as T,
    };
  });
};

type TokenSuccess<T extends string> = {
  type: "Success";
  match: T;
};

function lexAnyOf<TokenType, ErrorType, ErrorMessage>(
  parser: MutableParserInterface<
    { bindingPower: number },
    ErrorType,
    ErrorMessage
  >,
  tokens: Token<TokenType, ErrorMessage>[],
  unexpectedTokenMessage: ErrorNode
) {
  for (const t of tokens) {
    const lexedOutput = parser.lex(t);
    if (!parser.isErr(lexedOutput)) {
      return lexedOutput;
    }
  }

  return unexpectedTokenMessage;
}

const num = simpleToken(/[0-9]+/, "number");
const op = simpleToken(["+", "-", "*", "/"] as const, "op");
const openParen = simpleToken("(", "'('");
const closeParen = simpleToken(")", "')'");

type ExpressionNode =
  | {
      type: "Number";
      number: number;
    }
  | {
      type: "BinaryOp";
      left: PositionedNode;
      right: PositionedNode;
      op: "+" | "-" | "*" | "/";
    };

type ErrorNode = {
  type: "Error";
  reason: string;
};

type ParseState = {
  bindingPower: number;
  left?: PositionedNode;
};

type Node = ExpressionNode | ErrorNode;

type PositionedNode = Node & Positioned;

const bindingPowers = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
};

const consequentExpressionParselet: Parselet<
  ExpressionNode | ErrorNode,
  ParseState,
  ErrorNode,
  string
> = parselet((p) => {
  const left = p.state.left as PositionedNode;

  if (!p.isNext(op)) {
    return { type: "Error", reason: "" };
  }

  const first = p.lex(op);

  if (p.isErr(first)) {
    return { type: "Error", reason: "" };
  }

  const operator = first.match as "+" | "-" | "*" | "/";

  const nextBindingPower = bindingPowers[operator];

  if (nextBindingPower <= p.state.bindingPower) {
    return {
      type: "Error",
      reason: "",
    };
  }
  return {
    type: "BinaryOp",
    op: operator,
    left,
    right: p.parse(expressionParselet, {
      bindingPower: nextBindingPower,
    }),
  };
});

const initExpressionParselet: Parselet<
  ExpressionNode | ErrorNode,
  ParseState,
  ErrorNode,
  string
> = parselet((p) => {
  const first = lexAnyOf(p, [openParen, num], {
    type: "Error",
    reason: "Expected '(' or a number.",
  });

  if (p.isErr(first)) {
    throw p.err(first.reason);
  }

  // parenthesized
  if (first.match === "(") {
    const result = p.parse(expressionParselet, {
      bindingPower: 0,
    });
    p.lex(closeParen);
    return result;

    // non-parenthesized
  } else {
    return {
      type: "Number",
      number: Number(first.match),
    };
  }
});

const expressionParselet = parselet<
  ExpressionNode | ErrorNode,
  ParseState,
  ErrorNode
>((p) => {
  let left = p.parse(initExpressionParselet, p.state);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snapshot = p.getParserSnapshot();

    const nextParseNode = p.parse(consequentExpressionParselet, {
      bindingPower: p.state.bindingPower,
      left,
    });

    if (nextParseNode.type === "Error") {
      p.setParserSnapshot(snapshot);
      break;
    }

    left = nextParseNode;
  }

  return left;
});

function parseFFC(src: string) {
  const lexer = lexerFromString(src);
  const parser = parserFromLexer<ParseState, ErrorNode>(
    lexer,
    { bindingPower: 0, left: undefined },
    {
      makeErrorMessage(msg) {
        return { type: "Error", reason: msg } satisfies ErrorNode;
      },
      makeLexerError(pos) {
        return {
          type: "Error",
          reason: `Lexer error at position ${pos}`,
        } satisfies ErrorNode;
      },
      makeUnhandledError(err) {
        return {
          type: "Error",
          reason: `Unhandled internal error: ${err?.toString()} `,
        } satisfies ErrorNode;
      },
      isErr(err): err is ErrorNode {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (err as any).type === "Error";
      },
    }
  );

  const parserOutput = parser.parse(expressionParselet, {
    bindingPower: 0,
    left: undefined,
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
});
