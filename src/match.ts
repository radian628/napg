// opcode format:
// lower 29 bits: unicode code point
// 30th and 31st bits:
// 0: default
// 1: kleene star
// 2: union start
// 3: union end
// 4: concat start
// 5: concat end
// 6: range + start (next op is range end)

const isConcatEnd = (opcode: number) => {
  return opcode >> 25 === 5;
};
const isUnionEnd = (opcode: number) => {
  return opcode >> 25 === 3;
};

export type PatternIter = {
  data: number[];
  index: number;
};

export type StringIterator = {
  next: () => string;
  getpos: () => number;
  setpos: (n: number) => void;
};

/** */
export function match(pattern: PatternIter, str: StringIterator) {
  /** */
  function matchAny(pattern: PatternIter): number | undefined {
    const opcode = pattern.data[pattern.index] >> 25;

    switch (opcode) {
      case 0: {
        const nextchar = str.next();
        return String.fromCodePoint(pattern.data[pattern.index++]) === nextchar
          ? 1
          : undefined;
      }
      case 1:
        pattern.index++;
        return matchKleeneStar(pattern);
      case 2:
        pattern.index++;
        return matchUnion(pattern);
      case 4:
        pattern.index++;
        return matchConcat(pattern);
      case 6: {
        const start = pattern.data[pattern.index++] & ((2 << 25) - 1);
        const end = pattern.data[pattern.index++];
        const code = str.next().codePointAt(0) as number;
        const result = code >= start && code <= end ? 1 : undefined;
        return result;
      }
    }

    return undefined;
  }

  /** abc */
  function matchConcat(pattern: PatternIter) {
    let count = 0;
    while (!isConcatEnd(pattern.data[pattern.index])) {
      const m = matchAny(pattern);
      if (m === undefined) return undefined;
      count += m;
    }

    pattern.index++;

    return count;
  }

  /** a* */
  function matchKleeneStar(pattern: PatternIter) {
    const previndex = pattern.index;
    let count = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      pattern.index = previndex;
      const m = matchAny(pattern);
      if (m === undefined) {
        break;
      } else {
        count += m;
      }
    }

    return count;
  }

  /** a|b */
  function matchUnion(pattern: PatternIter) {
    while (!isUnionEnd(pattern.data[pattern.index])) {
      const pos = str.getpos();
      const m = matchAny(pattern);
      if (m !== undefined) {
        while (!isUnionEnd(pattern.data[pattern.index])) pattern.index++;
        pattern.index++;
        return m;
      }

      str.setpos(pos);
    }

    pattern.index++;

    // no variants matched
    return undefined;
  }

  return matchAny(pattern);
}

/** Match a pattern against a string.
 * @param pattern - Pattern to match
 * @param str - String to match.
 * @returns the number of characters matched, or undefined if no match.
 */
export function matchStr(pattern: number[], str: string) {
  let strindex = 0;
  return match(
    {
      data: pattern,
      index: 0,
    },
    {
      next: () => {
        return str[strindex++] ?? "";
      },
      getpos: () => strindex,
      setpos: (i: number) => (strindex = i),
    }
  );
}

/** a */
export function str(string: string) {
  if (string.length === 1) return [string.codePointAt(0) as number];

  return [
    (2 << 24) * 4,
    ...string.split("").map((s) => {
      return s.codePointAt(0) as number;
    }),
    (2 << 24) * 5,
  ];
}

/** ab */
export function concat(...args: (number[] | string)[]) {
  return [
    (2 << 24) * 4,
    ...args
      .map((a) => {
        return typeof a === "string" ? str(a) : a;
      })
      .flat(1),
    (2 << 24) * 5,
  ];
}

/** a|b */
export function union(...args: (number[] | string)[]) {
  if (args.length === 1)
    return typeof args[0] === "string" ? str(args[0]) : args[0];
  return [
    (2 << 24) * 2,
    ...args
      .map((a) => {
        return typeof a === "string" ? str(a) : a;
      })
      .flat(1),
    (2 << 24) * 3,
  ];
}

/** a* */
export function kleene(opcodes: number[]) {
  return [(2 << 24) * 1, ...opcodes];
}

/** a? */
export function maybe(opcodes: number[]) {
  return union(opcodes, str(""));
}

/** a\{n\} */
export function repeat(count: number, opcodes: number[]) {
  return concat(...new Array(count).fill(opcodes).flat(1));
}

/** a\{n,\} */
export function atleast(count: number, opcodes: number[]) {
  return concat(...new Array(count).fill(opcodes).flat(1), kleene(opcodes));
}

/** a\{l,h\} */
export function between(lo: number, hi: number, opcodes: number[]) {
  return concat(
    ...new Array(lo).fill(opcodes),
    ...new Array(hi - lo).fill(maybe(opcodes))
  );
}

/** [a-z] */
export function range(startChar: number, endChar: number) {
  return [(2 << 24) * 6 + startChar, endChar];
}
