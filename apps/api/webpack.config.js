const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = function(options) {
  return {
    ...options,
    entry: ['./src/main.ts'],
    externals: [
      nodeExternals({
        allowlist: ['@wasslchat/database'],
      }),
    ],
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                transpileOnly: true, // Skip type checking for faster builds
                configFile: 'tsconfig.json',
              },
            },
          ],
          exclude: /node_modules/,
        },
      ],
    },
    output: {
      ...options.output,
      path: path.join(__dirname, 'dist'),
    },
  };
};
