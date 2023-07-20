/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    "^.+\\.ts": [
      "ts-jest",
      {
        useESM: true,
      },
    ],
  },
  moduleDirectories: ["node_modules", "dist"],
  extensionsToTreatAsEsm: [".ts"],
};
