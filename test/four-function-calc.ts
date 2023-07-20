import {
  Positioned,
  lexerFromString,
  makeParseletBuilder,
  parserFromLexer,
  simpleTokenSpecBuilder,
} from "../dist";

type TokenSuccess<T extends string> = {
  type: "Success";
  match: T;
};

const simpleToken = simpleTokenSpecBuilder<"match", { type: "Success" }>(
  (name) => `Expected a ${name}`,
  <T extends string>(match: T) => {
    return {
      type: "Success",
      match,
    } satisfies TokenSuccess<T>;
  }
);

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

export type PositionedNode = Node & Positioned;

const bindingPowers = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
};

const parselet = makeParseletBuilder<ParseState, ErrorNode>();

const consequentExpressionParselet = parselet<ExpressionNode>((p) => {
  const left = p.state.left as PositionedNode;

  const first = p.lex(op);

  const operator = first.match;

  const nextBindingPower = bindingPowers[operator];

  // operator precedence of next binary op is too low,
  // so exit early
  if (nextBindingPower <= p.state.bindingPower) p.err("");

  return {
    type: "BinaryOp",
    op: operator,
    left,
    right: p.parse(expressionParselet, {
      bindingPower: nextBindingPower,
    }),
  };
});

const initExpressionParselet = parselet<ExpressionNode>((p) => {
  const first = p.lexFirstMatch([openParen, num], "Expected '(' or a number.");

  // parenthesized
  if (first.match === "(") {
    const result = p.parse(expressionParselet, {
      bindingPower: 0,
    }) as ExpressionNode | ErrorNode;
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

export const expressionParselet = parselet<ExpressionNode>((p) => {
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

export function ffcParser(src: string) {
  const lexer = lexerFromString(src);
  return parserFromLexer<ParseState, ErrorNode>(
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
          reason: `Unhandled internal error: ${JSON.stringify(err)} `,
        } satisfies ErrorNode;
      },
      isErr(err): err is ErrorNode {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (err as any).type === "Error";
      },
    }
  );
}
