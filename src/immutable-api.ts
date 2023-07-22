import { RopeIter } from "./rope.js";

export const position = Symbol("position");

export const skipTokens = Symbol("skipTokens");

export type Positioned<G extends ParserGenerics> = {
  [position]: {
    start: RopeIter;
    end: RopeIter;
  };
  [skipTokens]: {
    before: G["SkipToken"][];
    after: G["SkipToken"][];
  };
};

export type ParserGenerics = {
  State: unknown;
  Error: object;
  ErrorMessage: unknown;
  SkipToken: unknown;
  MyOutputType: object;
};

export type ParserOptions<
  G extends {
    ErrorMessage: unknown;
    Error: object;
  }
> = {
  makeErrorMessage: (msg: G["ErrorMessage"]) => G["Error"];
  makeLexerError: (position: number) => G["Error"];
  makeUnhandledError: (err: unknown) => G["Error"];
  isErr: <OutputType>(node: OutputType | G["Error"]) => node is G["Error"];
};

export type ChangeParserGenerics<
  G extends ParserGenerics,
  Node,
  State
> = Exclude<G, "MyOutputType" | "State"> & {
  MyOutputType: Node;
  State: State;
};

export type SkipTokensOf<G extends ParserGenerics> = Token<G["SkipToken"], G>[];

export interface Parser<G extends ParserGenerics> {
  parse<G2 extends ParserGenerics>(
    symbol: Parselet<G2>,
    state: G2["State"]
  ): [
    (G2["MyOutputType"] & Positioned<G2>) | (G2["Error"] & Positioned<G2>),
    Parser<G>
  ];
  lex<TokenType>(
    symbol: Token<TokenType, G>
  ): [TokenType | G["Error"], Parser<G>];
  state: G["State"];
  position: RopeIter;
  clone<G2 extends ParserGenerics>(
    parselet: Parselet<G2>,
    state: G2["State"]
  ): Parser<G2>;
  options: ParserOptions<G>;
  parselet: Parselet<G>;
  err(msg: G["ErrorMessage"]): never;
  isErr<OutputType>(node: OutputType | G["Error"]): node is G["Error"];
  skipTokens: SkipTokensOf<G>;
}

export interface Lexer {
  next(n: number): [string, Lexer];
  prev(n: number): Lexer;
  position: RopeIter;
}

export interface LexerInterface<ErrorMessage = string> extends Lexer {
  err(msg: ErrorMessage): never;
}

export type TokenFn<TokenType> = (lexer: Lexer) => TokenType;

export type Token<TokenType, G extends ParserGenerics> = {
  lex(lexer: LexerInterface<G["ErrorMessage"]>): [TokenType, Lexer];
};

export type Parselet<G extends ParserGenerics> = {
  parse(
    parser: Parser<G>,
    skipTokens: G["SkipToken"][]
  ): [G["MyOutputType"] | G["Error"], Parser<G>];
};

export function lexerFromString(iter: RopeIter): Lexer {
  return {
    position: iter,
    next(n) {
      const [tokenString, nextRopeIter] = iter.read(n);
      return [tokenString, lexerFromString(nextRopeIter)];
    },
    prev(n) {
      const nextIter = iter.prev(n);
      return lexerFromString(nextIter);
    },
  };
}

export function eliminateSkipTokens<G extends ParserGenerics>(
  parser: Parser<G>,
  skipTokens: G["SkipToken"][]
) {
  let parserToReturn = parser;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let breakAfterThis = true;
    for (const token of parserToReturn.skipTokens) {
      try {
        const output = parserToReturn.lex(token);
        if (parserToReturn.isErr(output[0])) continue;
        skipTokens.push(output[0]);
        parserToReturn = output[1];
        breakAfterThis = false;
        break;
      } catch {
        /* empty */
      }
    }
    if (breakAfterThis) break;
  }

  return parserToReturn;
}

export function parserFromLexer<G extends ParserGenerics>(
  lexer: Lexer,
  state: G["State"],
  parselet: Parselet<G>,
  skipTokensList: SkipTokensOf<G>,
  options: ParserOptions<{
    ErrorMessage: G["ErrorMessage"];
    Error: G["Error"];
  }>
): Parser<G> {
  return {
    skipTokens: skipTokensList,
    err(msg: G["ErrorMessage"]) {
      throw options.makeErrorMessage(msg);
    },
    isErr: options.isErr,
    parselet,
    options,
    position: lexer.position,
    state,
    lex<NodeType>(symbol: Token<NodeType, G>) {
      let hasThrownExpectedError = false;

      try {
        const [data, newLexer] = symbol.lex({
          next: lexer.next,
          prev: lexer.prev,
          err: (msg: G["ErrorMessage"]) => {
            hasThrownExpectedError = true;
            throw options.makeErrorMessage(msg);
          },
          position: lexer.position,
        });
        const newParser = parserFromLexer(
          newLexer,
          this.state,
          this.parselet,
          this.skipTokens,
          options
        );
        return [data, newParser];
      } catch (err) {
        if (hasThrownExpectedError) {
          const knownErr = err as G["Error"];
          return [knownErr, this];
        } else {
          return [options.makeUnhandledError(err), this];
        }
      }
    },
    clone(parselet, state) {
      return parserFromLexer(lexer, state, parselet, this.skipTokens, options);
    },
    parse<
      Node,
      State,
      P extends Parselet<ChangeParserGenerics<G, Node, State>>
    >(symbol: P, state: State) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      let parserToReturn: Parser<G> = this;

      const startPosition = parserToReturn.position;

      const skipTokensBefore: G["SkipToken"][] = [];

      const skipTokensAfter: G["SkipToken"][] = [];

      parserToReturn = eliminateSkipTokens(parserToReturn, skipTokensBefore);

      const parsedOutput = symbol.parse(
        parserToReturn.clone(symbol, state),
        skipTokensAfter
      );

      parserToReturn = parsedOutput[1];
      const outputToReturn2 = parsedOutput[0];
      const outputToReturn = outputToReturn2 as typeof outputToReturn2 &
        Positioned<G>;

      parserToReturn = eliminateSkipTokens(parserToReturn, skipTokensAfter);

      const endPosition = parserToReturn.position;

      const beforeSkipTokens = [
        ...skipTokensBefore,
        ...(outputToReturn?.[skipTokens]?.before ?? []),
      ];

      const afterSkipTokens = [
        ...skipTokensAfter,
        ...(outputToReturn?.[skipTokens]?.after ?? []),
      ];

      return [
        {
          ...outputToReturn,
          [position]: {
            start: startPosition,
            end: endPosition,
          },
          [skipTokens]: {
            before: beforeSkipTokens,
            after: afterSkipTokens,
          },
        },
        parserToReturn,
      ];
    },
  };
}
