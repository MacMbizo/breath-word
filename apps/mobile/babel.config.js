// B3 §4.1 — Expo Babel config.
//
// `babel-preset-expo` already appends the `react-native-worklets/plugin` (and the legacy
// `react-native-reanimated/plugin`) automatically when those packages are installed, so it is
// deliberately NOT listed here — adding it twice makes Babel throw a duplicate-plugin error.
module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
