# Roadmap

Progress on the design goals from the README:

1. Output is typesafe, so this is satisfied.
2. I've got essentially everything aside from some minor (but acceptable) ordering issues with skip tokens.
3. Essentially complete aside from the problem of attaching position and skipToken info. This is not a big deal though.
4. Essentially complete with the error node system.
5. Done.
6. Done.

Future challenges:

- Implement proper range invalidation so the incremental parser doesn't blindly skip over sections that need to be reparsed.
- Make the rope rebalance itself from time to time.
- Make some kind of a declarative language sorta thing that runs on top of the lexer so that patterns are easy to make.
- Add sensible default hash and eq functions. Add a parsenode prototype and stuff and add hash and eq handlers to that.
- Add another abstraction layer because right now the interface is crawling with annoying implementation details (e.g. range invalidation handler). Either way, make it possible to "peel back the layers" if needed.
