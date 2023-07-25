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

export type Swap<T extends object, Swp extends object> = Omit<T, keyof Swp> &
  Swp;

export type SkipTokensOf<SkipToken, ErrorMessage> = Token<
  SkipToken,
  ErrorMessage
>[];

export interface Parser<G extends ParserGenerics> {
  parse<
    NewOutputType extends object,
    NewState,
    G2 extends Swap<G, { MyOutputType: NewOutputType; State: NewState }>
  >(
    symbol: Parselet<G2>,
    state: G2["State"],
    isInRange: (start: RopeIter, end: RopeIter) => boolean
  ): [
    (
      | (G2["MyOutputType"] & Positioned<G["SkipToken"]>)
      | (G["Error"] & Positioned<G["SkipToken"]>)
    ),
    Parser<G>
  ];
  lex<TokenType>(
    symbol: Token<TokenType, G["ErrorMessage"]>
  ): [TokenType | G["Error"], Parser<G>];
  state: G["State"];
  position: RopeIter;
  clone<
    NewOutputType extends object,
    NewState,
    G2 extends Swap<G, { MyOutputType: NewOutputType; State: NewState }>
  >(
    parselet: Parselet<G2>,
    state: G2["State"]
  ): Parser<G2>;
  options: ParserOptions<Pick<G, "Error" | "ErrorMessage">>;
  parselet: Parselet<G>;
  err(msg: G["ErrorMessage"]): never;
  isErr<OutputType>(node: OutputType | G["Error"]): node is G["Error"];
  skipTokens: SkipTokensOf<G["SkipToken"], G["ErrorMessage"]>;
  exec: (
    isInRange: (start: RopeIter, end: RopeIter) => boolean
  ) => G["MyOutputType"] & Positioned<G["SkipToken"]>;
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

export type Parselet<G extends ParserGenerics> = {
  parse(
    parser: Parser<G>,
    skipTokens: G["SkipToken"][],
    isInRange: (start: RopeIter, end: RopeIter) => boolean
  ): [G["MyOutputType"] | G["Error"], Parser<G>];
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

/**
 * Construct a parser from an existing lexer.
 * @param lexer - The lexer from which to construct a parser.
 * @param state - Initial parse state prior to parsing anything.
 * @param parselet - Parselet to use for the initial parse.
 * @param skipTokensList - A list of skippable tokens.
 * @param options - Some parser options for creating error messages.
 * @returns A parser snapshot located at the chosen position.
 */
export function parserFromLexer<G extends ParserGenerics>(
  lexer: Lexer,
  state: G["State"],
  parselet: Parselet<G>,
  skipTokensList: SkipTokensOf<G["SkipToken"], G["ErrorMessage"]>,
  options: ParserOptions<{
    ErrorMessage: G["ErrorMessage"];
    Error: G["Error"];
  }>
): Parser<G> {
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
    clone<G2 extends Swap<G, { MyOutputType: object; State: unknown }>>(
      parselet: Parselet<G2>,
      state: G2["State"]
    ) {
      return parserFromLexer<G2>(
        lexer,
        state,
        parselet,
        // @ts-expect-error this constraint is satisfied
        this.skipTokens,
        options
      );
    },
    // @ts-expect-error this constraint is satisfied
    parse<
      Node extends object,
      State,
      P extends Parselet<Swap<G, { MyOutputType: Node; State: State }>>
    >(
      symbol: P,
      state: State,
      isInRange: (start: RopeIter, end: RopeIter) => boolean
    ) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      let parserToReturn: Parser<G> = this;

      const startPosition = parserToReturn.position;

      const skipTokensBefore: G["SkipToken"][] = [];

      const skipTokensAfter: G["SkipToken"][] = [];

      parserToReturn = eliminateSkipTokens(parserToReturn, skipTokensBefore);

      const parsedOutput = symbol.parse(
        parserToReturn.clone(symbol, state),
        skipTokensAfter,
        isInRange
      );

      // @ts-expect-error actually, it does fulfill the constraint
      parserToReturn = parsedOutput[1].clone<G["MyOutputType"], G["State"], G>(
        this.parselet,
        this.state
      );
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
