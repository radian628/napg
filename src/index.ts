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

export { compilePattern } from "./pattern.js";

export { matchStr } from "./match.js";

/**
 *
 * @param t - Node to get the position of.
 * @returns The positional information of this node.
 */
export function pos<T extends Positioned<never>>(t: T) {
  return t[position];
}

/**
 * Should not be instantiated directly. Provides an interface to
 * assist in consuming input for lexical analysis.
 */
export interface MutableLexerInterface<ErrorMessage> {
  next(n: number): string;
  prev(n: number): void;
  getpos(): number;
  setpos(n: number): void;
  err(msg: ErrorMessage): never;
}

/**
 * Create a token.
 *
 * @param fn - Callback function which is executed to
 * consume input and generate the token.
 * @returns A type of your choice that represents the token.
 * This can be a string if that is sufficient, or even an object
 * to represent multiple, hard-to-distinguish token types.
 */
export function token<TokenType, ErrorMessage>(
  fn: (iter: MutableLexerInterface<ErrorMessage>) => TokenType
): Token<TokenType, ErrorMessage> {
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
        err(msg: ErrorMessage) {
          throw lexer.err(msg);
        },
      });

      return [output, nextLexer];
    },
  };
}

/**
 * Should not be created directly. Represents an interface for parsing.
 */
export interface MutableParserInterface<G extends ParserGenerics> {
  parse<G2 extends ParserGenerics>(
    symbol: Parselet<G2>,
    state: G2["State"]
  ):
    | (G2["MyOutputType"] & Positioned<G2["SkipToken"]>)
    | (G["Error"] & Positioned<G2["SkipToken"]>);
  lex<OutputType>(symbol: Token<OutputType, G["ErrorMessage"]>): OutputType;
  lexFirstMatch<OutputType>(
    tokens: Token<OutputType, G["ErrorMessage"]>[],
    fallbackErrorMessage: G["ErrorMessage"]
  ): OutputType;
  err(msg: G["ErrorMessage"]): never;
  isErr<OutputType>(node: OutputType | G["Error"]): node is G["Error"];
  state: G["State"];
  isNext<OutputType>(symbol: Token<OutputType, G["ErrorMessage"]>): boolean;
  getParserSnapshot(): Parser<G>;
  setParserSnapshot(snapshot: Parser<G>): void;
}

/**
 * Helper function for generating parselets without needing to
 * specify a bunch of generics each time.
 * @returns A function that returns a parselet with all the generics from
 * `makeParseletBuilder` applied.
 */
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

/**
 * Directly create a parselet without having to go through makeParseletBuilder.
 * @param fn - The callback function that's used to create the parse node.
 * @param hash - Hash function for parse state.
 * @param eq - Test if two parse states are equal.
 * @returns A parselet, which can be used to parse nodes.
 */
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

/**
 *
 */
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

/**
 *
 */
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

/**
 * Create a token based on pattern bytecode.
 * @param pattern - Pattern bytecode. This can be created with `compilePattern`.
 * @param onMatch - Construct a token object (or string, etc) from a matched string.
 * @param err - Error message to display if there is no match.
 * @returns A token object.
 */
export function matchToken<T, ErrorMessage>(
  pattern: number[],
  onMatch: (str: string) => T,
  err: ErrorMessage
) {
  return token<T, ErrorMessage>((iter) => {
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

/**
 *
 */
function rangeIntersect(
  start1: number,
  end1: number,
  start2: number,
  end2: number
) {
  return start1 <= end2 && end1 >= start2;
}

/**
 * @param iter - The iterator at which parsing is starting.
 */
export type GetParserCallback<G extends ParserGenerics> = (
  iter: RopeIter
) => Parser<G>;

/**
 * Represents a text document that can change and be incrementally re-parsed.
 */
export class LivingDocument<G extends ParserGenerics> {
  data: Rope;
  getParser: (rope: RopeIter) => Parser<G>;
  pendingChanges: { start: number; end: number }[];

  /**
   *
   * @param data - Initial text document data.
   * @param getParser - Gets the initial parser when re-parsing.
   *
   */
  constructor(data: string, getParser: GetParserCallback<G>) {
    this.data = new RopeLeaf(data);
    this.getParser = getParser;
    this.pendingChanges = [];
  }

  /**
   * Replace a section of the document.
   * @param start - Start index of the slice that should be removed and replaced.
   * @param end - End index of the slice that should be removed and replace.
   * @param str - String to replace the slice with.
   */
  replace(start: number, end: number, str: string) {
    this.pendingChanges.push({ start, end });
    this.data = replace(this.data, start, end, new RopeLeaf(str)).replacedRope;
  }

  /**
   * Parse the document, incrementally if possible.
   * @returns The parsenode corresponding to the type of parser you supplied
   * to this function.
   */
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
