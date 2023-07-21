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

type NumberNode = {
  type: "Number";
  number: number;
};

type BinaryOpNode = {
  type: "BinaryOp";
  left: PositionedNode;
  right: PositionedNode;
  op: "+" | "-" | "*" | "/";
};

type ExpressionNode = NumberNode | BinaryOpNode;

type ErrorNode = {
  type: "Error";
  reason: string;
};

type InitParseState = {
  bindingPower: number;
};

type ConsequentParseState = InitParseState & {
  left: PositionedNode;
};

type Node = ExpressionNode | ErrorNode;

export type PositionedNode = Node & Positioned;

export type ParserTypes = {
  MyOutputType: ExpressionNode;
  State: InitParseState;
  Error: ErrorNode;
  ErrorMessage: string;
  SkipToken: TokenSuccess<string>;
};

const simpleToken = simpleTokenSpecBuilder<
  "match",
  { type: "Success" },
  ParserTypes
>(
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

const bindingPowers = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
};

const parselet = makeParseletBuilder<ParserTypes>();

const consequentExpressionParselet = parselet<
  ExpressionNode,
  ConsequentParseState
>((p) => {
  const first = p.lex(op);
  const nextBindingPower = bindingPowers[first.match];

  // operator precedence of next binary op is too low,
  // so exit early
  if (nextBindingPower <= p.state.bindingPower) p.err("");

  return {
    type: "BinaryOp",
    op: first.match,
    left: p.state.left,
    right: p.parse(expressionParselet, {
      bindingPower: nextBindingPower,
    }),
  };
});

const initExpressionParselet = parselet<ExpressionNode, InitParseState>((p) => {
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

export const expressionParselet = parselet<ExpressionNode, InitParseState>(
  (p) => {
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
  }
);

export function ffcParser(src: string) {
  const lexer = lexerFromString(src);
  return parserFromLexer<ParserTypes>(
    lexer,
    { bindingPower: 0 },
    expressionParselet,
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
