const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = (env, argv) => {
  const isProduction = argv.mode === "production";

  return {
    entry: "./src/index.tsx",
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "index.js",
      clean: true,
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js", ".jsx"],
      alias: {
        "@services": path.resolve(__dirname, "src/services"),
        "@components": path.resolve(__dirname, "src/components"),
        "@panels": path.resolve(__dirname, "src/panels"),
        "@hooks": path.resolve(__dirname, "src/hooks"),
        "@types": path.resolve(__dirname, "src/types"),
        "@utils": path.resolve(__dirname, "src/utils"),
      },
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ["style-loader", "css-loader"],
        },
      ],
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          { from: "plugin/manifest.json", to: "manifest.json" },
          { from: "plugin/icons", to: "icons", noErrorOnMissing: true },
        ],
      }),
    ],
    devtool: isProduction ? false : "source-map",
    externals: {
      // UXP modules are provided by the host runtime
      uxp: "commonjs2 uxp",
      premierepro: "commonjs2 premierepro",
    },
    target: "web",
    optimization: {
      minimize: isProduction,
    },
  };
};
