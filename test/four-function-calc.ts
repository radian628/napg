import {
  Positioned,
  RopeIter,
  RopeLeaf,
  compilePattern,
  lexerFromString,
  makeParseletBuilder,
  matchToken,
  parserFromLexer,
  position,
  token,
} from "../dist";

// NOTE: See this article to understand the design of this parser more in-depth:
// https://engineering.desmos.com/articles/pratt-parser/

// token type
type TokenSuccess<T extends string> = {
  type: "Success";
  match: T;
};

// number literal
type NumberNode = {
  type: "Number";
  number: number;
};

// binary operation between two expressions
type BinaryOpNode = {
  type: "BinaryOp";
  left: PositionedNode;
  right: PositionedNode;
  op: "+" | "-" | "*" | "/";
};

// all expressions
type ExpressionNode = NumberNode | BinaryOpNode;

// node that is created if the parser encounters an error during parsing
type ErrorNode = {
  type: "Error";
  reason: string;
};

// both types of parse state that will influence the parser
type InitParseState = {
  bindingPower: number;
};
type ConsequentParseState = InitParseState & {
  left: PositionedNode;
};

// expressions or error nodes
type Node = ExpressionNode | ErrorNode;

// type to represent a node with position and skipToken information attached
// (i.e. where it is in the input string and what tokens around it were skipped)
export type PositionedNode = Node &
  Positioned<{ type: "Success"; match: string }>;

// This type is never instantiated directly. Instead, it acts as a "bundle"
// of generics to supply to various functions so you don't have to supply
// all of them individually.
export type ParserTypes = {
  MyOutputType: ExpressionNode;
  State: InitParseState;
  Error: ErrorNode;
  ErrorMessage: string;
  SkipToken: { type: "Success"; match: string };
};

// Helper function for creating tokens from a list of possible alternative chars
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
const whitespace = charToken([" ", "\n"]);
// Tokens can also be made with a custom regex-like language
// Builtin JS regex can't be used because it can't do a partial match.
// this lamnguage is compiled to a bytecode format
const num = matchToken(
  compilePattern("[0-9]+"),
  (str) => {
    return {
      type: "Success",
      match: str,
    };
  },
  "Expected a number."
);

// map of binding powers (operator precedence)
const bindingPowers = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
};

// hash function for initialParseState
const hashIPS = (state: InitParseState) => {
  const hash = state.bindingPower;
  return hash;
};

// "is equal?" function for initialParseState
const eqIPS = (a: InitParseState, b: InitParseState) => {
  return a.bindingPower === b.bindingPower;
};

// Create a "parselet builder", a function for easily making parselets.
// This mainly exists to avoid having to supply tons of generics.
// Note that the "parselet" function has three parameters.
// The first is a handler that will actually build the parseNode
// The second is a hash function for the parse state. This is necessary for
// incremental parsing. Its only real purpose is to allow hashing objects
// by value, so it doesn't need to be any good.
// The third is an equality function for the parse state, which is also
// needed for caching.
const parselet = makeParseletBuilder<ParserTypes>();

// Matches operators and other such things that "combine" parsenodes together.
const consequentExpressionParselet = parselet<
  ConsequentParseState,
  BinaryOpNode
>(
  (p) => {
    // get the next token, expecting it to be an operator
    const first = p.lex(op);
    // get its precedence
    const nextBindingPower = bindingPowers[first.match];

    // operator precedence of next binary op is too low,
    // so exit early
    if (nextBindingPower <= p.state.bindingPower) p.err("");

    // it's a valid binary operator
    return {
      type: "BinaryOp",
      op: first.match,
      left: p.state.left,
      right: p.parse(expressionParselet, {
        bindingPower: nextBindingPower,
      }),
    };
  },
  (state) => {
    return state.bindingPower * 100000000 + state.left[position].id * 100000;
  },
  (a, b) => {
    return a.bindingPower === b.bindingPower && a.left === b.left;
  }
);

// Parse initial expressions (numbers or parenthesized expressions)
const initExpressionParselet = parselet<InitParseState, ExpressionNode>(
  (p) => {
    // lexFirstMatch tries to lex all the listed tokens in order
    // The first match is chosen.
    const first = p.lexFirstMatch(
      [openParen, num],
      "Expected '(' or a number."
    );

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
  },
  hashIPS,
  eqIPS
);

// This function actually parses a complete expression.
const expressionParselet = parselet<InitParseState, ExpressionNode>(
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
  },
  hashIPS,
  eqIPS
);

// Makes a four-function calculator parser from the ground up.
export function ffcParser(src: RopeIter) {
  // Make the lexer
  const lexer = lexerFromString(src);

  // make the parser
  return parserFromLexer<ParserTypes>(
    lexer,
    { bindingPower: 0 }, // Initial parse state
    expressionParselet, // Initial parselet
    [whitespace], // List of tokens to be skipped
    {
      // Converts an error message to a full error node
      makeErrorMessage(msg) {
        return { type: "Error", reason: msg } satisfies ErrorNode;
      },
      // Converts a lexer error to a full error node
      makeLexerError(pos) {
        return {
          type: "Error",
          reason: `Lexer error at position ${pos}`,
        } satisfies ErrorNode;
      },
      // Converts an arbitrary error with an unknown type (since you can throw anything)
      // into an error node.
      makeUnhandledError(err) {
        return {
          type: "Error",
          reason: `Unhandled internal error: ${JSON.stringify(err)} `,
        } satisfies ErrorNode;
      },
      // Detects if a node is an error node.
      isErr(err): err is ErrorNode {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (err as any).type === "Error";
      },
    }
  );
}

// Parse a string into a four-function calculator syntax tree
export function parseFFC(src: string) {
  // Create the parser
  const parser = ffcParser(new RopeLeaf(src).iter(0));

  // Run the parser. The callback here is just used for cache invalidation.
  const parserOutput = parser.exec(() => true);

  return parserOutput;
}

// Actually evaluate the syntax tree as a mathematical expression.
export function evalFFC(tree: PositionedNode): number {
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
