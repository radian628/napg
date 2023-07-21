import {
  Lexer,
  Parselet,
  Parser,
  ParserGenerics,
  Positioned,
  Token,
  position,
} from "./immutable-api.js";

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
} from "./immutable-api.js";

export function pos<T extends Positioned>(t: T) {
  return t[position];
}

export interface MutableLexerInterface<G extends ParserGenerics> {
  match(symbol: string | readonly string[] | RegExp): string | undefined;
  err(msg: G["ErrorMessage"]): never;
}

export function token<TokenType, G extends ParserGenerics>(
  fn: (lexer: MutableLexerInterface<G>) => TokenType
): Token<TokenType, G> {
  return {
    type: "token",
    lex(lexer) {
      let newLexer = lexer as Lexer;
      const output = fn({
        match(symbol) {
          const [output, lexer2] = newLexer.match(symbol);
          newLexer = lexer2;
          return output;
        },
        err: (msg) => lexer.err(msg),
      });
      return [output, newLexer];
    },
  };
}

export interface MutableParserInterface<G extends ParserGenerics> {
  parse<G2 extends ParserGenerics>(
    symbol: Parselet<G2>,
    state: G2["State"]
  ): (G2["MyOutputType"] & Positioned) | (G["Error"] & Positioned);
  lex<OutputType>(symbol: Token<OutputType, G>): OutputType;
  lexFirstMatch<OutputType>(
    tokens: Token<OutputType, G>[],
    fallbackErrorMessage: G["ErrorMessage"]
  ): OutputType;
  err(msg: G["ErrorMessage"]): never;
  isErr<OutputType>(node: OutputType | G["Error"]): node is G["Error"];
  state: G["State"];
  positionify<OutputType>(t: OutputType): OutputType & Positioned;
  isNext<OutputType>(symbol: Token<OutputType, G>): boolean;
  getParserSnapshot(): Parser<G>;
  setParserSnapshot(snapshot: Parser<G>): void;
}

export function makeParseletBuilder<
  G extends Exclude<ParserGenerics, "MyOutputType" | "State">
>() {
  return <State, NodeType extends object>(
    fn: (
      parser: MutableParserInterface<
        G & { MyOutputType: NodeType; State: State }
      >
    ) => NodeType | G["Error"]
  ) => parselet(fn);
}

export function parselet<G extends ParserGenerics>(
  fn: (parser: MutableParserInterface<G>) => G["MyOutputType"] | G["Error"]
): Parselet<G> {
  return {
    type: "parselet",
    parse(parser) {
      const startPos = parser.position;
      let newParser = parser as Parser<G>;
      let encounteredErrNormally = false;
      try {
        const output = fn({
          parse(symbol, newState) {
            const [output, parser2] = newParser.parse(symbol, newState);
            newParser = parser2;
            return output;
          },
          lex(symbol) {
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
          positionify(t) {
            return {
              ...t,
              [position]: {
                start: startPos,
                end: newParser.position,
              },
            };
          },
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
        return [output, newParser];
      } catch (err) {
        if (encounteredErrNormally) {
          const errAsNode = err as G["Error"];
          return [errAsNode, newParser];
        } else {
          const errAsNode = newParser.options.makeUnhandledError(err);
          return [errAsNode, newParser];
        }
      }
    },
  };
}

export const simpleTokenSpecBuilder =
  <
    TokenStringKey extends string | symbol | number,
    TokenSuccess,
    G extends ParserGenerics
  >(
    generateErrorMessage: (name: string) => G["ErrorMessage"],
    generateSuccess: <T extends string>(
      match: T
    ) => TokenSuccess & { [K in TokenStringKey]: T }
  ) =>
  <T extends string>(
    symbol: T | readonly T[] | RegExp,
    name: string
  ): Token<TokenSuccess & { [K in TokenStringKey]: T }, G> => {
    return token((lexer) => {
      const match = lexer.match(symbol);
      if (match === undefined) lexer.err(generateErrorMessage(name));
      return generateSuccess(match as T);
    });
  };
