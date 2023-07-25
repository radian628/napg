import { RopeIter } from "./rope.js";

export const position = Symbol("position");

export const skipTokens = Symbol("skipTokens");

export type Positioned<SkipToken> = {
  [position]: {
    start: RopeIter;
    length: number;
    id: number;
  };
  [skipTokens]: {
    before: SkipToken[];
    after: SkipToken[];
  };
};

/**
 *
 * @prop Error - Error node type for this parser.
 * @prop ErrorMessage - Error message node type for this parser. Used to
 * create error messages which are then translated into errors, so that
 * you don't have to construct error objects every single time.
 * @prop SkipToken - Skip token type for this parser. All skip tokens
 * are of this type.
 */
export type PerParserGenerics = {
  Error: object;
  ErrorMessage: unknown;
  SkipToken: unknown;
};
/**
 * @prop Node - The type of node that this parselet produces.
 * @prop State - The parse state associated with this parselet
 * that will be passed in when it is called.
 */
export type PerParseletGenerics = {
  Node: object;
  State: unknown;
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

export type Swap<T extends object, Swp extends object> = Omit<T, keyof Swp> &
  Swp;

export type SkipTokensOf<SkipToken, ErrorMessage> = Token<
  SkipToken,
  ErrorMessage
>[];

export interface Parser<
  G extends PerParserGenerics,
  PG extends PerParseletGenerics
> {
  parse<PG2 extends PerParseletGenerics>(
    symbol: Parselet<G, PG2>,
    state: PG2["State"],
    isInRange: (start: RopeIter, end: RopeIter) => boolean
  ): [
    (
      | (PG2["Node"] & Positioned<G["SkipToken"]>)
      | (G["Error"] & Positioned<G["SkipToken"]>)
    ),
    Parser<G, PG>
  ];
  lex<TokenType>(
    symbol: Token<TokenType, G["ErrorMessage"]>
  ): [TokenType | G["Error"], Parser<G, PG>];
  state: PG["State"];
  position: RopeIter;
  clone<PG2 extends PerParseletGenerics>(
    parselet: Parselet<G, PG2>,
    state: PG2["State"]
  ): Parser<G, PG2>;
  options: ParserOptions<Pick<G, "Error" | "ErrorMessage">>;
  parselet: Parselet<G, PG>;
  err(msg: G["ErrorMessage"]): never;
  isErr<OutputType>(node: OutputType | G["Error"]): node is G["Error"];
  skipTokens: SkipTokensOf<G["SkipToken"], G["ErrorMessage"]>;
  exec: (
    isInRange: (start: RopeIter, end: RopeIter) => boolean
  ) => PG["Node"] & Positioned<G["SkipToken"]>;
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

export type Token<TokenType, ErrorMessage> = {
  lex(lexer: LexerInterface<ErrorMessage>): [TokenType, Lexer];
};

export type Parselet<
  G extends PerParserGenerics,
  PG extends PerParseletGenerics
> = {
  parse(
    parser: Parser<G, PG>,
    skipTokens: G["SkipToken"][],
    isInRange: (start: RopeIter, end: RopeIter) => boolean
  ): [PG["Node"] | G["Error"], Parser<G, PG>];
};

/**
 * Construct an immutable lexer snapshot.
 * @param iter - Rope iterator from which to construct the lexer.
 * @returns A lexer positioned at the rope iterator.
 */
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

/**
 * Get rid of all immediately visible skippable tokens in the input.
 * @param parser - Parser that is parsing the skippable tokens.
 * @param skipTokens - Skippable tokens that are found will be appended to this list.
 * @returns The parser snapshot after parsing skippable tokens.
 */
export function eliminateSkipTokens<
  G extends PerParserGenerics,
  PG extends PerParseletGenerics
>(parser: Parser<G, PG>, skipTokens: G["SkipToken"][]) {
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

/**
 * Construct a parser from an existing lexer.
 * @param lexer - The lexer from which to construct a parser.
 * @param state - Initial parse state prior to parsing anything.
 * @param parselet - Parselet to use for the initial parse.
 * @param skipTokensList - A list of skippable tokens.
 * @param options - Some parser options for creating error messages.
 * @returns A parser snapshot located at the chosen position.
 */
export function parserFromLexer<
  G extends PerParserGenerics,
  PG extends PerParseletGenerics
>(
  lexer: Lexer,
  state: PG["State"],
  parselet: Parselet<G, PG>,
  skipTokensList: SkipTokensOf<G["SkipToken"], G["ErrorMessage"]>,
  options: ParserOptions<{
    ErrorMessage: G["ErrorMessage"];
    Error: G["Error"];
  }>
): Parser<G, PG> {
  return {
    exec(isInRange: (start: RopeIter, end: RopeIter) => boolean) {
      return this.parse(this.parselet, this.state, isInRange)[0];
    },
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
    parse(symbol, state, isInRange) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      let parserToReturn: Parser<G, PG> = this;

      const startPosition = parserToReturn.position;

      const skipTokensBefore: G["SkipToken"][] = [];

      const skipTokensAfter: G["SkipToken"][] = [];

      parserToReturn = eliminateSkipTokens(parserToReturn, skipTokensBefore);

      const parsedOutput = symbol.parse(
        parserToReturn.clone(symbol, state),
        skipTokensAfter,
        isInRange
      );

      parserToReturn = parsedOutput[1].clone(this.parselet, this.state);
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
            start: this.position,
            length: endPosition.index() - startPosition.index(),
            id: globalid++,
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

let globalid = 0;
