module.exports = function (api) {
  api.cache(true);
  return {
    // O perfil hermes-v1 (Expo SDK 56 / RN 0.85) NÃO transforma class-properties
    // (Hermes novo suporta class fields nativamente). Mas os decorators legados do
    // WatermelonDB EXIGEM class-properties depois deles — senão o campo cai no
    // `_initializerWarningHelper`, que lança em runtime "Decorating class property failed".
    //
    // Correção cirúrgica: desligar os decorators do preset e, SÓ nos arquivos de
    // models, rodar decorators legados + class-properties (loose). Como o `overrides`
    // com `test` no topo do config quebra o loadPartialConfigSync do Expo (cache key,
    // chamado sem filename), embrulhamos o override em um PRESET local — overrides
    // dentro de preset não têm esse problema. O React Native segue no transform
    // nativo do hermes-v1 (class-properties global quebra o RN: "read-only NONE").
    presets: [
      ['babel-preset-expo', { decorators: false }],
      function watermelonModelsPreset() {
        return {
          overrides: [
            {
              test: /src[\\/]db[\\/]models[\\/]/,
              plugins: [
                ['@babel/plugin-proposal-decorators', { legacy: true }],
                ['@babel/plugin-transform-class-properties', { loose: true }],
              ],
            },
          ],
        };
      },
    ],
  };
};
