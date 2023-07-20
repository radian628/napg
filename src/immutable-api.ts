export const position = Symbol("position");

export type Positioned = {
  [position]: {
    start: number;
    end: number;
  };
};

export interface Parser<State, ErrorType, ErrorMessage = string> {
  parse<OutputType>(
    symbol: Parselet<OutputType, State, ErrorType, ErrorMessage>,
    state: State
  ): [
    (OutputType & Positioned) | (ErrorType & Positioned),
    Parser<State, ErrorType, ErrorMessage>
  ];
  lex<OutputType>(
    symbol: Token<OutputType, ErrorMessage>
  ): [OutputType | ErrorType, Parser<State, ErrorType, ErrorMessage>];
  state: State;
  position: number;
  clone(): Parser<State, ErrorType, ErrorMessage>;
}

export interface ParserInterface<State, ErrorType, ErrorMessage = string>
  extends Parser<State, ErrorType, ErrorMessage> {
  err(msg: ErrorMessage): never;
  isErr<OutputType>(node: OutputType | ErrorType): node is ErrorType;
}

export interface Lexer {
  match(symbol: string | string[] | RegExp): [string | undefined, Lexer];
  position: number;
}

export interface LexerInterface<ErrorMessage = string> extends Lexer {
  err(msg: ErrorMessage): never;
}

export type TokenFn<TokenType> = (lexer: Lexer) => TokenType;

export type Token<TokenType, ErrorMessage> = {
  lex(lexer: LexerInterface<ErrorMessage>): [TokenType, Lexer];
  type: "token";
};

export type Parselet<NodeType, State, ErrorType, ErrorMessage> = {
  parse(
    parser: ParserInterface<State, ErrorType, ErrorMessage>
  ): [NodeType | ErrorType, Parser<State, ErrorType, ErrorMessage>];
  type: "parselet";
};

export function lexerFromString(input: string, position?: number): Lexer {
  const pos = position ?? 0;

  const getReturnValue = (str: string | undefined) =>
    [str, lexerFromString(input, pos + (str?.length ?? 0))] satisfies [
      string | undefined,
      Lexer
    ];

  return {
    position: pos,
    match(symbol) {
      if (symbol instanceof RegExp) {
        const match = input.slice(pos).match(symbol);
        if (match) return getReturnValue(match[0]);
      } else if (Array.isArray(symbol)) {
        for (const item of symbol) {
          if (input.slice(pos).startsWith(item)) return getReturnValue(item);
        }
      } else {
        if (input.slice(pos).startsWith(symbol)) return getReturnValue(symbol);
      }
      return getReturnValue(undefined);
    },
  };
}

export function parserFromLexer<State, ErrorType, ErrorMessage = string>(
  lexer: Lexer,
  state: State,
  options: {
    makeErrorMessage: (msg: ErrorMessage) => ErrorType;
    makeLexerError: (position: number) => ErrorType;
    makeUnhandledError: (err: unknown) => ErrorType;
    isErr: <OutputType>(node: OutputType | ErrorType) => node is ErrorType;
  }
): Parser<State, ErrorType, ErrorMessage> {
  return {
    position: lexer.position,
    state,
    lex<OutputType>(symbol: Token<OutputType, ErrorMessage>) {
      let hasThrownExpectedError = false;

      try {
        const [data, newLexer] = symbol.lex({
          match: lexer.match,
          err: (msg: ErrorMessage) => {
            hasThrownExpectedError = true;
            throw options.makeErrorMessage(msg);
          },
          position: lexer.position,
        });
        const newParser = parserFromLexer(newLexer, this.state, options);
        return [data, newParser];
      } catch (err) {
        if (hasThrownExpectedError) {
          const knownErr = err as ErrorType;
          return [knownErr, this];
        } else {
          return [options.makeUnhandledError(err), this];
        }
      }
    },
    clone() {
      return parserFromLexer(lexer, this.state, options);
    },
    parse<OutputType>(
      symbol: Parselet<OutputType, State, ErrorType, ErrorMessage>,
      state: State
    ) {
      let hasThrownExpectedError = false;
      const startPosition = this.position;

      // eslint-disable-next-line @typescript-eslint/no-this-alias
      let parserToReturn: Parser<State, ErrorType, ErrorMessage> = this;
      let outputToReturn: OutputType | ErrorType;

      try {
        const parsedOutput = symbol.parse({
          parse: this.parse,
          lex: this.lex,
          state,
          err: (msg: ErrorMessage) => {
            hasThrownExpectedError = true;
            throw options.makeErrorMessage(msg);
          },
          position: this.position,
          isErr: options.isErr,
          clone: this.clone,
        });
        parserToReturn = options.isErr(parsedOutput[0])
          ? this
          : parsedOutput[1];
        outputToReturn = parsedOutput[0];
      } catch (err) {
        if (hasThrownExpectedError) {
          outputToReturn = err as ErrorType;
        } else {
          outputToReturn = options.makeUnhandledError(err);
        }
      }

      const endPosition = parserToReturn.position;

      return [
        {
          ...outputToReturn,
          [position]: {
            start: startPosition,
            end: endPosition,
          },
        },
        parserToReturn,
      ];
    },
  };
}
