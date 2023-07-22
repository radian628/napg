import {
  Positioned,
  RopeLeaf,
  lexerFromString,
  makeParseletBuilder,
  parserFromLexer,
  token,
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

export type PositionedNode = Node & Positioned<ParserTypes>;

export type ParserTypes = {
  MyOutputType: ExpressionNode;
  State: InitParseState;
  Error: ErrorNode;
  ErrorMessage: string;
  SkipToken: { type: "Success"; match: string };
};

// const num = simpleToken(/[0-9]+/, "number");
// const op = simpleToken(["+", "-", "*", "/"] as const, "op");
// const openParen = simpleToken("(", "'('");
// const closeParen = simpleToken(")", "')'");
// const whitespace = simpleToken(/\s+/, "whitespace");

function charToken<T extends string>(alts: readonly T[]) {
  return token<TokenSuccess<T>, ParserTypes>((lexer) => {
    const tkn = lexer.next(1);
    if ((alts as readonly string[]).includes(tkn)) {
      return {
        type: "Success",
        match: tkn as T,
      };
    } else {
      throw lexer.err(
        `Expected one of ${alts.map((a) => `'${a}'`).join(", ")}`
      );
    }
  });
}

const op = charToken(["+", "-", "*", "/"]);
const openParen = charToken(["("]);
const closeParen = charToken([")"]);
const num = token((lexer) => {
  let num = "";
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const char = lexer.next(1);
    if (char.match(/\d/)) {
      num += char;
    } else {
      lexer.prev(char.length);
      break;
    }
  }
  if (num) {
    return {
      type: "Success",
      match: num,
    };
  } else {
    throw lexer.err("Expected a number.");
  }
});
const whitespace = charToken([" ", "\n"]);

const bindingPowers = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
};

const parselet = makeParseletBuilder<ParserTypes>();

const consequentExpressionParselet = parselet<
  ConsequentParseState,
  BinaryOpNode
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

const initExpressionParselet = parselet<InitParseState, ExpressionNode>((p) => {
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

export const expressionParselet = parselet<InitParseState, ExpressionNode>(
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
  const lexer = lexerFromString(new RopeLeaf(src).iter(0));
  return parserFromLexer<ParserTypes>(
    lexer,
    { bindingPower: 0 },
    expressionParselet,
    [whitespace],
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
