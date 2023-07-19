/* eslint-disable @typescript-eslint/no-explicit-any */
interface ImmutableTokenBuilder {
  // if this function outputs a string, it's matched it
  // and then it advances along
  match(
    against: string | string[] | RegExp
  ): [ImmutableTokenBuilder, string] | [ImmutableTokenBuilder, undefined];

  isNext<Output>(
    tkn: TokenSpec<Output>
  ): [ImmutableTokenBuilder, false] | [ImmutableTokenBuilder, true, Output];

  position(): number;
}

export interface TokenBuilder {
  // if this function outputs a string, it's matched it
  // and then it advances along
  match(against: string | string[] | RegExp): string | undefined;
}

export type TokenSpec<Output> = {
  // either output true and a converted token or false
  // tokens can create whatever output they want so that custom tokens
  // can contain any data they please
  match(input: TokenBuilder): [true, Output] | [false];
};

interface ImmutableParseInput<
  ErrorNodeType,
  ParseState,
  ErrorMessageType = string
> {
  expect<Output>(
    token: TokenSpec<Output>,
    errorMessage: ErrorMessageType
  ): [Output, ImmutableParseInput<ErrorNodeType, ParseState, ErrorMessageType>];
  readonly errorState: boolean;
  readonly parseState: ParseState;
  position(): number;
  clone(): ImmutableParseInput<ErrorNodeType, ParseState, ErrorMessageType>;
}

export interface ParseInput<
  ErrorNodeType,
  ErrorMessageType = string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ErrorNodeInput extends any[] = [string]
> {
  // expect the given token type to occur next
  // throws an error if it doesn't
  expect<Output>(
    token: TokenSpec<Output>,
    errorMessage: ErrorMessageType
  ): Output;
  position(): number;
  errorState: boolean;
  pushState(): void;
  popState(): void;
  err(...input: ErrorNodeInput): ErrorNodeType;
}

type LexingInfo = {
  start: number;
  end: number;
};

type Positioned<
  ParseNodeType,
  Property extends string | symbol | number = "pos"
> = ParseNodeType & {
  [key in Property]: LexingInfo;
};

export type ParseletSpec<
  State,
  Output,
  ErrorNodeType,
  ErrorMessageType = string,
  ErrorNodeInput extends any[] = [string]
> = {
  // parse
  parse(
    input: ParseInput<ErrorNodeType, ErrorMessageType, ErrorNodeInput>,
    state: State
  ): Output;
};

export function parselet<
  State,
  Output,
  ErrorNodeType,
  ErrorMessageType = string,
  ErrorNodeInput extends any[] = [string]
>(
  parse: (
    input: ParseInput<ErrorNodeType, ErrorMessageType, ErrorNodeInput>,
    state: State
  ) => Output
) {
  return { parse };
}

export function token(matcher: string | string[] | RegExp): TokenSpec<string> {
  return {
    match(input) {
      const match = input.match(matcher);
      return match ? [true, match] : [false];
    },
  };
}

export function makeImmutableTokenBuilder(
  input: string,
  stringpos: number
): ImmutableTokenBuilder {
  return {
    position() {
      return stringpos;
    },

    match(against: string | string[] | RegExp) {
      if (typeof against === "string") {
        if (against !== input.slice(stringpos, stringpos + against.length))
          return [this, undefined];
        return [
          makeImmutableTokenBuilder(input, stringpos + against.length),
          against,
        ];
      } else if (Array.isArray(against)) {
        for (const entry of against) {
          if (entry !== input.slice(stringpos, stringpos + entry.length))
            continue;
          return [
            makeImmutableTokenBuilder(input, stringpos + entry.length),
            entry,
          ];
        }
        return [this, undefined];
      } else {
        const match = input.slice(stringpos).match(against);
        if (!match || match.index !== 0) return [this, undefined];
        return [
          makeImmutableTokenBuilder(input, stringpos + match.length),
          match[0],
        ];
      }
    },

    isNext<Output>(tkn: TokenSpec<Output>) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      let nextImmutableTokenBuilder: ImmutableTokenBuilder = this;

      const match = tkn.match({
        match(against) {
          const result = nextImmutableTokenBuilder.match(against);
          nextImmutableTokenBuilder = result[0];
          if (result[1]) return result[1];
        },
      });

      if (match[0]) {
        return [nextImmutableTokenBuilder, true, match[1]] as [
          ImmutableTokenBuilder,
          true,
          Output
        ];
      } else {
        return [nextImmutableTokenBuilder, false] as [
          ImmutableTokenBuilder,
          false
        ];
      }
    },
  };
}

export class ImmutableStringParseInput<
  ErrorNodeType,
  ParseState,
  ErrorMessageType = string
> implements ImmutableParseInput<ErrorNodeType, ParseState, ErrorMessageType>
{
  parseState: ParseState;
  errorState: boolean;
  tokens!: ImmutableTokenBuilder;
  errorMessageToNode: (msg: ErrorMessageType) => ErrorNodeType;

  constructor(
    tokens: ImmutableTokenBuilder,
    parseState: ParseState,
    errorMessageToNode: (msg: ErrorMessageType) => ErrorNodeType
  ) {
    this.errorMessageToNode = errorMessageToNode;
    this.tokens = tokens;
    this.parseState = parseState;
    this.errorState = false;
  }

  expect<Output>(
    token: TokenSpec<Output>,
    errorMessage: ErrorMessageType
  ): [
    Output,
    ImmutableParseInput<ErrorNodeType, ParseState, ErrorMessageType>
  ] {
    const maybeToken = this.tokens.isNext(token);

    this.errorState = true;
    if (!maybeToken[1]) throw this.errorMessageToNode(errorMessage);

    return [
      maybeToken[2],
      new ImmutableStringParseInput(
        maybeToken[0],
        this.parseState,
        this.errorMessageToNode
      ),
    ];
  }

  position() {
    return this.tokens.position();
  }

  clone() {
    return new ImmutableStringParseInput(
      this.tokens,
      this.parseState,
      this.errorMessageToNode
    );
  }
}

export class StringParseInput<
  ErrorNodeType,
  ParseState,
  ErrorMessageType = string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ErrorNodeInput extends any[] = [string]
> implements ParseInput<ErrorNodeType, ErrorMessageType, ErrorNodeInput>
{
  stateStack: ImmutableParseInput<
    ErrorNodeType,
    ParseState,
    ErrorMessageType
  >[];
  errorState = false;

  err: (...args: ErrorNodeInput) => ErrorNodeType;

  constructor(
    str: string,
    initState: ParseState,
    errorMessageToNode: (msg: ErrorMessageType) => ErrorNodeType,
    err: (...args: ErrorNodeInput) => ErrorNodeType
  ) {
    this.stateStack = [
      new ImmutableStringParseInput(
        makeImmutableTokenBuilder(str, 0),
        initState,
        errorMessageToNode
      ),
    ];
    this.err = err;
  }

  replaceTopOfStack(
    ipi: ImmutableParseInput<ErrorNodeType, ParseState, ErrorMessageType>
  ) {
    this.stateStack[this.stateStack.length - 1] = ipi;
  }

  topOfStack() {
    return this.stateStack[this.stateStack.length - 1];
  }

  expect<Output>(token: TokenSpec<Output>, errorMessage: ErrorMessageType) {
    const output = this.topOfStack().expect(token, errorMessage);
    this.replaceTopOfStack(output[1]);
    return output[0];
  }

  position() {
    return this.topOfStack().position();
  }

  pushState() {
    this.stateStack.push(this.topOfStack().clone());
  }

  popState(): void {
    this.stateStack.pop();
  }
}

export function makeParseFn<
  State,
  ErrorNodeType,
  PositionProp extends string | symbol | number = "pos"
>(settings: {
  // parse node property for storing char position information
  positionProperty: PositionProp;

  // function for error handling when no other option is available
  defaultErrorNode: (err: unknown) => ErrorNodeType;
}): <Output>(
  input: ParseInput<ErrorNodeType>,
  parselet: ParseletSpec<State, Output, ErrorNodeType>,
  state: State
) =>
  | Positioned<Output, PositionProp>
  | Positioned<ErrorNodeType, PositionProp> {
  return (input, parselet, state) => {
    const start = input.position();
    try {
      // normal path (parse node properly)
      input.errorState = false;
      const parsedOutput = parselet.parse(input, state);
      const end = input.position();
      return {
        ...parsedOutput,
        [settings.positionProperty]: { start, end },
      } as Positioned<typeof parsedOutput, PositionProp>;

      // encounter error while parsing
    } catch (err) {
      const end = input.position();
      let output: ErrorNodeType;

      // if input is marked as encountering an error,
      // then it threw an error node
      if (input.errorState) {
        output = err as ErrorNodeType;

        // otherwise, some other (perhaps unintentional) error was thrown
        // and the parser should fall back to defaultErrorNode
      } else {
        output = settings.defaultErrorNode(err);
      }

      return {
        ...output,
        [settings.positionProperty]: { start, end },
      } as Positioned<ErrorNodeType, PositionProp>;
    }
  };
}
