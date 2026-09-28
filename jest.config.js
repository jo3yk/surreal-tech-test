/** Transform shimmiestack (untranspiled ESM). Leave this file alone. */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  transform: {
    "^.+\\.[tj]s$": [
      "ts-jest",
      {
        tsconfig: {
          target: "ES2025",
          module: "CommonJS",
          moduleResolution: "Node",
          esModuleInterop: true,
          allowJs: true,
          skipLibCheck: true,
          strict: true,
        },
      },
    ],
  },
  transformIgnorePatterns: ["node_modules/(?!(shimmiestack|uuid)/)"],
  testTimeout: 15000,
};
