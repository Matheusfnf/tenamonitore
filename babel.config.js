module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Os models do WatermelonDB usam decorators legados em class fields
    // anotados com `!`. Isso exige semântica "set" (atribuição) em vez de
    // Object.defineProperty — caso contrário o Babel do SDK 56 rejeita com
    // "Definitely assigned fields cannot be initialized here".
    assumptions: { setPublicClassFields: true },
    plugins: [['@babel/plugin-proposal-decorators', { legacy: true }]],
  };
};
