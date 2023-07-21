export const position = Symbol("position");

export type Positioned = {
  [position]: {
    start: number;
    end: number;
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

export interface Parser<G extends ParserGenerics> {
  parse<G2 extends ParserGenerics>(
    symbol: Parselet<G2>,
    state: G2["State"]
  ): [
    (G2["MyOutputType"] & Positioned) | (G2["Error"] & Positioned),
    Parser<G>
  ];
  lex<TokenType>(
    symbol: Token<TokenType, G>
  ): [TokenType | G["Error"], Parser<G>];
  state: G["State"];
  position: number;
  clone<G2 extends ParserGenerics>(
    parselet: Parselet<G2>,
    state: G2["State"]
  ): Parser<G2>;
  options: ParserOptions<G>;
  parselet: Parselet<G>;
  err(msg: G["ErrorMessage"]): never;
  isErr<OutputType>(node: OutputType | G["Error"]): node is G["Error"];
}

export interface Lexer {
  match(
    symbol: string | readonly string[] | RegExp
  ): [string | undefined, Lexer];
  position: number;
}

export interface LexerInterface<ErrorMessage = string> extends Lexer {
  err(msg: ErrorMessage): never;
}

export type TokenFn<TokenType> = (lexer: Lexer) => TokenType;

export type Token<TokenType, G extends ParserGenerics> = {
  lex(lexer: LexerInterface<G["ErrorMessage"]>): [TokenType, Lexer];
  type: "token";
};

export type Parselet<G extends ParserGenerics> = {
  parse(parser: Parser<G>): [G["MyOutputType"] | G["Error"], Parser<G>];
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
      } else if (typeof symbol === "string") {
        if (input.slice(pos).startsWith(symbol)) return getReturnValue(symbol);
      }
      return getReturnValue(undefined);
    },
  };
}

export function parserFromLexer<G extends ParserGenerics>(
  lexer: Lexer,
  state: G["State"],
  parselet: Parselet<G>,
  options: ParserOptions<{
    ErrorMessage: G["ErrorMessage"];
    Error: G["Error"];
  }>
): Parser<G> {
  return {
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
          match: lexer.match,
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
      return parserFromLexer(lexer, state, parselet, options);
    },
    parse<
      Node,
      State,
      P extends Parselet<ChangeParserGenerics<G, Node, State>>
    >(symbol: P, state: State) {
      const startPosition = this.position;

      // eslint-disable-next-line @typescript-eslint/no-this-alias
      let parserToReturn: Parser<G> = this;

      const parsedOutput = symbol.parse(this.clone(symbol, state));

      parserToReturn = parsedOutput[1];
      const outputToReturn = parsedOutput[0];

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
