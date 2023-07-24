import { HashTable } from "./hash-table.js";
import {
  Lexer,
  Parselet,
  Parser,
  ParserGenerics,
  Positioned,
  Token,
  eliminateSkipTokens,
  position,
} from "./immutable-api.js";
import { RopeIter } from "./rope.js";

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

export function pos<T extends Positioned<never>>(t: T) {
  return t[position];
}

export interface MutableLexerInterface<G extends ParserGenerics> {
  next(n: number): string;
  prev(n: number): void;
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
  G extends Exclude<ParserGenerics, "MyOutputType" | "State">
>() {
  return <State, NodeType extends object>(
    ...args: Parameters<
      typeof parselet<G & { State: State; MyOutputType: NodeType }>
    >
  ) => parselet(...args);
}

export function parselet<G extends ParserGenerics>(
  fn: (parser: MutableParserInterface<G>) => G["MyOutputType"] | G["Error"],
  hash: (state: G["State"], position: RopeIter) => number,
  eq: (a: G["State"], b: G["State"]) => boolean
): Parselet<G> {
  const cache = new HashTable<
    [G["State"], RopeIter],
    [G["MyOutputType"], Parser<G>]
  >(
    (key) => hash(...key),
    ([state1, pos1], [state2, pos2]) => eq(state1, state2) && pos1.equals(pos2)
  );

  return {
    parse(parser, skipTokens, isInRange) {
      const entry = cache.get([parser.state, parser.position]);

      if (entry && !isInRange(parser.position, entry[1].position)) {
        console.log("Actually used the cache: ", entry[0]);
        return entry;
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

      cache.set([parser.state, parser.position], ret);

      return ret;
    },
  };
}

// export const simpleTokenSpecBuilder =
//   <
//     TokenStringKey extends string | symbol | number,
//     TokenSuccess,
//     G extends ParserGenerics
//   >(
//     generateErrorMessage: (name: string) => G["ErrorMessage"],
//     generateSuccess: <T extends string>(
//       match: T
//     ) => TokenSuccess & { [K in TokenStringKey]: T }
//   ) =>
//   <T extends string>(
//     symbol: T | readonly T[] | RegExp,
//     name: string
//   ): Token<TokenSuccess & { [K in TokenStringKey]: T }, G> => {
//     return token((lexer) => {
//       const match = lexer.match(symbol);
//       if (match === undefined) lexer.err(generateErrorMessage(name));
//       return generateSuccess(match as T);
//     });
//   };
