import {
  Positioned,
  lexerFromString,
  parserFromLexer,
  position,
} from "./immutable-api.js";
import {
  MutableParserInterface,
  RopeLeaf,
  makeParseletBuilder,
  matchToken,
  token,
} from "./index.js";
import {
  atleast,
  between,
  concat,
  kleene,
  maybe,
  range,
  str,
  union,
} from "./match.js";

export type Node =
  | StrNode
  | VariadicOpNode
  | ErrorNode
  | UnaryOpNode
  | RepeatNode
  | RangeNode;

export type ErrorNode = {
  type: "Error";
  reason: string;
};

export type ParserTypes = {
  MyOutputType: Node;
  State: InitParseState;
  Error: ErrorNode;
  ErrorMessage: string;
  SkipToken: { type: "Success"; match: string };
};

export type PositionedNode = Node & Positioned<ParserTypes["SkipToken"]>;

export type StrNode = {
  type: "Str";
  str: string;
};

export type VariadicOpNode = {
  type: "VariadicOp";
  operator: "|" | "concat";
  operands: PositionedNode[];
};

export type UnaryOpNode = {
  type: "UnOp";
  operator: "*" | "?" | "+";
  operand: PositionedNode;
};

export type RepeatNode = {
  type: "Repeat";
  lo?: number;
  hi?: number;
  operand: PositionedNode;
};

export type RangeNode = {
  type: "Range";
  startChar: number;
  endChar: number;
};

export type InitParseState = number;
export type ConsequentParseState = {
  bindingPower: number;
  left: PositionedNode;
};

const matchToToken = (x: string) => x;

const specialSymbols = "|*?+{}()[]".split("");

const escapableSymbols = [...specialSymbols, "%"];

export const tokens = {
  binop: matchToken(str("|"), matchToToken, "Expected a binary operator."),
  unop: matchToken(
    union("*", "?", "+"),
    matchToToken,
    "Expected a unary operator."
  ),
  openCurly: matchToken(str("{"), matchToToken, "Expected '{'"),
  closeCurly: matchToken(str("}"), matchToToken, "Expected '}'"),
  openParen: matchToken(str("("), matchToToken, "Expected '('"),
  closeParen: matchToken(str(")"), matchToToken, "Expected ')'"),
  openSquare: matchToken(str("["), matchToToken, "Expected '['"),
  closeSquare: matchToken(str("]"), matchToToken, "Expected ']'"),
  dash: matchToken(str("-"), matchToToken, "Expected '-'"),
  str: token((lexer) => {
    let str = "";
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const char = lexer.next(1);
      if (char.length === 0) {
        if (str.length === 0) lexer.err("Expected a string literal.");
        return str;
      } else if (specialSymbols.includes(char) && str[str.length - 1] !== "%") {
        lexer.prev(1);
        return str;
      }
      str += char;
    }
  }),
  char: token((lexer) => {
    const char = lexer.next(1);
    if (char === "") {
      lexer.err("Unexpected end of input.");
    }
    if (char === "%") {
      const char2 = lexer.next(1);
      return char2;
    }
    return char;
  }),
  comma: matchToken(str(","), matchToToken, "Expected ','"),
  maybeNumber: matchToken(
    kleene(union(...new Array(10).fill(0).map((e, i) => i.toString()))),
    matchToToken,
    "Expected a number."
  ),
};

/** */
function unescapePatternString(str: string) {
  let out = "";

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === "%") {
      i++;
      if (escapableSymbols.includes(str[i])) out += str[i];
    } else {
      out += char;
    }
  }

  return out;
}

const bindingPowers: Record<string, number | undefined> = {
  "|": 1,
  "(": 2,
  "[": 2,
  "*": 3,
  "?": 3,
  "+": 3,
  "{": 3,
};

const parselet = makeParseletBuilder<ParserTypes>();

/** */
function parseCharacterSet(
  p: MutableParserInterface<Omit<ParserTypes, "State"> & { State: unknown }>
) {
  const node: VariadicOpNode = {
    type: "VariadicOp",
    operator: "|",
    operands: [],
  };
  while (
    !p.isNext(tokens.closeSquare) &&
    node.operands[node.operands.length - 1]?.type !== "Error"
  ) {
    node.operands.push(p.parse(characterSetItemParselet, 0));
  }
  p.lex(tokens.closeSquare);
  return node;
}

const consequentExpressionParselet = parselet<ConsequentParseState, Node>(
  (p): Node => {
    const first = p.lexFirstMatch(
      [tokens.binop, tokens.unop, tokens.openCurly, tokens.openParen],
      "Expected a binary or a unary operator."
    );

    const nextBindingPower = bindingPowers[first] ?? 1;

    if (nextBindingPower <= p.state.bindingPower) p.err("");

    switch (first) {
      case "+":
      case "*":
      case "?":
        return {
          type: "UnOp",
          operator: first,
          operand: p.state.left,
        };
      case "|":
        if (
          p.state.left.type === "VariadicOp" &&
          p.state.left.operator === "|"
        ) {
          return {
            type: "VariadicOp",
            operator: "|",
            operands: [
              ...p.state.left.operands,
              p.parse(expressionParselet, nextBindingPower),
            ],
          };
        } else {
          return {
            type: "VariadicOp",
            operator: "|",
            operands: [
              p.state.left,
              p.parse(expressionParselet, nextBindingPower),
            ],
          };
        }
      case "{": {
        const loStr = p.lex(tokens.maybeNumber);
        p.lex(tokens.comma);
        const hiStr = p.lex(tokens.maybeNumber);
        p.lex(tokens.closeCurly);
        return {
          lo: loStr ? Number(loStr) : undefined,
          hi: hiStr ? Number(hiStr) : undefined,
          type: "Repeat",
          operand: p.state.left,
        };
      }
      case "[": {
        return parseCharacterSet(p);
      }
      case "(": {
        const expr = p.parse(expressionParselet, 0);
        p.lex(tokens.closeParen);
        if (
          p.state.left.type === "VariadicOp" &&
          p.state.left.operator === "concat"
        ) {
          return {
            type: "VariadicOp",
            operator: "concat",
            operands: [...p.state.left.operands, expr],
          };
        } else {
          return {
            type: "VariadicOp",
            operator: "concat",
            operands: [p.state.left, expr],
          };
        }
      }
    }

    throw p.err(`Unreachable! First token was '${first}'`);
  },
  (state) => {
    return state.left[position].id * 10000 + state.bindingPower;
  },
  (a, b) => {
    return (
      a.left[position].id === b.left[position].id &&
      a.bindingPower === b.bindingPower
    );
  }
);

const ipsHash = (e: number) => e;
const ipsEq = (e: number) => e === e;

const characterSetItemParselet = parselet<InitParseState, Node>(
  (p) => {
    const rangeStart = unescapePatternString(p.lex(tokens.char));
    if (p.isNext(tokens.dash)) {
      p.lex(tokens.dash);
      const rangeEnd = unescapePatternString(p.lex(tokens.char));
      return {
        type: "Range",
        startChar: rangeStart.codePointAt(0) as number,
        endChar: rangeEnd.codePointAt(0) as number,
      };
    }
    return {
      type: "Str",
      str: rangeStart,
    };
  },
  ipsHash,
  ipsEq
);

const initExpressionParselet = parselet<InitParseState, Node>(
  (p) => {
    const first = p.lexFirstMatch(
      [tokens.openParen, tokens.openSquare, tokens.str],
      "Expected '(', '[', or a string literal"
    );

    if (first === "[") {
      return parseCharacterSet(p);
    } else if (first === "(") {
      const result = p.parse(expressionParselet, 0) as Node;
      p.lex(tokens.closeParen);
      return result;
    } else {
      return {
        type: "Str",
        str: unescapePatternString(first),
      };
    }
  },
  ipsHash,
  ipsEq
);

const expressionParselet = parselet<InitParseState, Node>(
  (p) => {
    let left = p.parse(initExpressionParselet, p.state);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const snapshot = p.getParserSnapshot();

      const nextParseNode = p.parse(consequentExpressionParselet, {
        bindingPower: p.state,
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
  ipsHash,
  ipsEq
);

/**
 *
 * @param str - Pattern string to parse
 * @returns A pattern syntax tree.
 */
export function parsePattern(str: string) {
  const lexer = lexerFromString(new RopeLeaf(str).iter(0));
  const parser = parserFromLexer<ParserTypes>(
    lexer,
    0,
    expressionParselet,
    [],
    {
      makeErrorMessage(msg) {
        return {
          type: "Error",
          reason: msg,
        };
      },
      makeLexerError(pos) {
        return {
          type: "Error",
          reason: `Lexer error at ${pos}`,
        };
      },
      makeUnhandledError(err) {
        return {
          type: "Error",
          reason: err ? err.toString() : "undefined",
        };
      },
      isErr(node): node is ErrorNode {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return node && (node as any).type === "Error";
      },
    }
  );

  return parser.exec(() => false);
}

/**
 *
 * @param tree - Pattern syntax tree to compile into bytecode.
 * @returns Pattern bytecode.
 */
export function compilePatternTree(tree: PositionedNode): number[] {
  switch (tree.type) {
    case "Range":
      return range(tree.startChar, tree.endChar);
    case "Error":
      throw new Error(
        `Error compiling pattern at position ${tree[position].start.index()}: ${
          tree.reason
        }`
      );
    case "Repeat": {
      const inner = compilePatternTree(tree.operand);
      if (tree.hi !== undefined) {
        return between(tree.lo ?? 0, tree.hi, inner);
      } else {
        return atleast(tree.lo ?? 0, inner);
      }
    }
    case "Str":
      return str(tree.str);
    case "UnOp": {
      const inner = compilePatternTree(tree.operand);
      switch (tree.operator) {
        case "*":
          return kleene(inner);
        case "+":
          return atleast(1, inner);
        case "?":
          return maybe(inner);
      }
      break;
    }
    case "VariadicOp": {
      const operands = tree.operands.map((o) => compilePatternTree(o));
      switch (tree.operator) {
        case "|":
          return union(...operands);
        case "concat":
          return concat(...operands);
      }
    }
  }
}

/**
 *
 * @param str - The string representing the pattern. Uses a Regex-like syntax.
 * Note that `%` is the escape character, not `\`.
 * @returns Bytecode representing the compiled pattern.
 */
export function compilePattern(str: string) {
  return compilePatternTree(parsePattern(str));
}
