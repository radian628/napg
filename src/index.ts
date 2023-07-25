import { HashTable } from "./hash-table.js";
import {
  Lexer,
  Parselet,
  Parser,
  ParserGenerics,
  Positioned,
  Token,
  eliminateSkipTokens,
  lexerFromString,
  position,
} from "./immutable-api.js";
import { match } from "./match.js";
import { Rope, RopeIter, RopeLeaf, replace, root } from "./rope.js";

export {
  Token,
  Parselet,
  Lexer,
  Parser,
  parserFromLexer,
  lexerFromString,
  position,
  Positioned,
  ParserGenerics,
  skipTokens,
} from "./immutable-api.js";

export {
  replace,
  Rope,
  RopeBranch,
  RopeLeaf,
  RopeIter,
  RopeIterMut,
} from "./rope.js";

export { matchStr, str, kleene, union, between, atleast } from "./match.js";

export { compilePattern } from "./pattern.js";

export function pos<T extends Positioned<never>>(t: T) {
  return t[position];
}

export interface MutableLexerInterface<G extends ParserGenerics> {
  next(n: number): string;
  prev(n: number): void;
  getpos(): number;
  setpos(n: number): void;
  err(msg: G["ErrorMessage"]): never;
}

export function token<TokenType, G extends ParserGenerics>(
  fn: (iter: MutableLexerInterface<G>) => TokenType
): Token<TokenType, G> {
  return {
    lex(lexer) {
      let nextLexer = lexer as Lexer;

      const output = fn({
        next(n) {
          const [str, lexer2] = nextLexer.next(n);
          nextLexer = lexer2;
          return str;
        },
        prev(n) {
          const l = nextLexer.prev(n);
          nextLexer = l;
        },
        getpos() {
          return nextLexer.position.index();
        },
        setpos(pos: number) {
          const lexer2 = root(nextLexer.position.rope).iter(pos);
          nextLexer = lexerFromString(lexer2);
        },
        err(msg: G["ErrorMessage"]) {
          throw lexer.err(msg);
        },
      });

      return [output, nextLexer];
    },
  };
}

export interface MutableParserInterface<G extends ParserGenerics> {
  parse<G2 extends ParserGenerics>(
    symbol: Parselet<G2>,
    state: G2["State"]
  ):
    | (G2["MyOutputType"] & Positioned<G2["SkipToken"]>)
    | (G["Error"] & Positioned<G2["SkipToken"]>);
  lex<OutputType>(symbol: Token<OutputType, G>): OutputType;
  lexFirstMatch<OutputType>(
    tokens: Token<OutputType, G>[],
    fallbackErrorMessage: G["ErrorMessage"]
  ): OutputType;
  err(msg: G["ErrorMessage"]): never;
  isErr<OutputType>(node: OutputType | G["Error"]): node is G["Error"];
  state: G["State"];
  isNext<OutputType>(symbol: Token<OutputType, G>): boolean;
  getParserSnapshot(): Parser<G>;
  setParserSnapshot(snapshot: Parser<G>): void;
}

export function makeParseletBuilder<
  G extends Omit<ParserGenerics, "MyOutputType" | "State">
>() {
  return <State, NodeType extends object>(
    ...args: Parameters<
      typeof parselet<
        Omit<G, "MyOutputType" | "State"> & {
          State: State;
          MyOutputType: NodeType;
        }
      >
    >
  ) => parselet(...args);
}

export function parselet<G extends ParserGenerics>(
  fn: (parser: MutableParserInterface<G>) => G["MyOutputType"] | G["Error"],
  hash: (state: G["State"]) => number,
  eq: (a: G["State"], b: G["State"]) => boolean
): Parselet<G> {
  const cache = new HashTable<
    G["State"],
    Map<RopeIter, [G["MyOutputType"], Parser<G>]>
  >((key) => hash(key), eq);

  return {
    parse(parser, skipTokens, isInRange) {
      const posmap = cache.get(parser.state);
      const entry = posmap?.get(parser.position);

      if (entry) {
        if (isInRange(parser.position, entry[1].position)) {
          nestedMapDelete(cache, parser.state, (m) =>
            m.delete(parser.position)
          );
        } else {
          return entry;
        }
      }

      let ret: [G["MyOutputType"], Parser<G>];

      let newParser = parser as Parser<G>;
      let encounteredErrNormally = false;
      try {
        const output = fn({
          parse(symbol, newState) {
            const [output, parser2] = newParser.parse(
              symbol,
              newState,
              isInRange
            );
            newParser = parser2;
            return output;
          },
          lex(symbol) {
            newParser = eliminateSkipTokens(newParser, skipTokens);

            const [output, parser2] = newParser.lex(symbol);
            newParser = parser2;
            if (newParser.options.isErr(output)) {
              encounteredErrNormally = true;
              throw output;
            }

            return output;
          },
          err: (msg) => {
            encounteredErrNormally = true;
            return parser.err(msg);
          },
          isErr: parser.isErr,
          state: parser.state,
          isNext(symbol) {
            const [output] = newParser.lex(symbol);
            return !parser.isErr(output);
          },
          getParserSnapshot() {
            return newParser;
          },
          setParserSnapshot(snapshot) {
            newParser = snapshot;
          },
          lexFirstMatch(tokens, fallbackErrorMessage) {
            for (const t of tokens) {
              const [output, parser2] = newParser.lex(t);
              if (!this.isErr(output)) {
                newParser = parser2;
                return output;
              }
            }
            encounteredErrNormally = true;
            throw newParser.options.makeErrorMessage(fallbackErrorMessage);
          },
        });
        ret = [output, newParser];
      } catch (err) {
        if (encounteredErrNormally) {
          const errAsNode = err as G["Error"];
          ret = [errAsNode, newParser];
        } else {
          const errAsNode = newParser.options.makeUnhandledError(err);
          ret = [errAsNode, newParser];
        }
      }

      multiMapSet(cache, parser.state, new Map(), (m) =>
        m.set(parser.position, ret)
      );

      return ret;
    },
  };
}

function multiMapSet<
  K,
  V,
  M extends {
    get: (k: K) => V | undefined;
    set: (k: K, v: V) => void;
  }
>(map: M, key: K, fallback: V, callback: (v: V) => void) {
  let v = map.get(key);
  if (v === undefined) {
    v = fallback;
    map.set(key, v);
  }

  callback(v);
}

function nestedMapDelete<
  K,
  V extends Map<unknown, unknown>,
  M extends {
    get: (k: K) => V | undefined;
    delete: (k: K) => boolean;
  }
>(map: M, key: K, callback: (v: V) => boolean) {
  const innerMap = map.get(key);

  if (innerMap) {
    callback(innerMap);
  }

  if (innerMap && innerMap?.size === 0) {
    return map.delete(key);
  } else {
    return false;
  }
}

export function matchToken<T, G extends ParserGenerics>(
  pattern: number[],
  onMatch: (str: string) => T,
  err: G["ErrorMessage"]
) {
  return token<T, G>((iter) => {
    const iterStart = iter.getpos();

    const matches = match(
      {
        data: pattern,
        index: 0,
      },
      {
        next: () => {
          const char = iter.next(1);
          return char;
        },
        getpos: iter.getpos,
        setpos: iter.setpos,
      }
    );

    if (matches !== undefined) {
      iter.setpos(iterStart);
      return onMatch(iter.next(matches));
    } else {
      throw iter.err(err);
    }
  });
}

function rangeIntersect(
  start1: number,
  end1: number,
  start2: number,
  end2: number
) {
  return start1 <= end2 && end1 >= start2;
}

export class LivingDocument<G extends ParserGenerics> {
  data: Rope;
  getParser: (rope: RopeIter) => Parser<G>;
  pendingChanges: { start: number; end: number }[];

  constructor(data: string, getParser: (rope: RopeIter) => Parser<G>) {
    this.data = new RopeLeaf(data);
    this.getParser = getParser;
    this.pendingChanges = [];
  }

  replace(start: number, end: number, str: string) {
    this.pendingChanges.push({ start, end });
    this.data = replace(this.data, start, end, new RopeLeaf(str)).replacedRope;
  }

  parse() {
    const result = this.getParser(this.data.iter(0)).exec((start, end) => {
      const iStart = start.index();
      const iEnd = end.index();

      for (const change of this.pendingChanges) {
        if (rangeIntersect(iStart, iEnd, change.start - 1, change.end + 1)) {
          return true;
        }
      }

      return false;
    });
    this.pendingChanges = [];
    return result;
  }
}
