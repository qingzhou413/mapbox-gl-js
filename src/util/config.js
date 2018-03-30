// @flow

type Config = {|
  API_URL: string,
  REQUIRE_ACCESS_TOKEN: boolean,
  ACCESS_TOKEN: ?string
|};

const config: Config = {
    API_URL: 'https://api.unimap.io',
    REQUIRE_ACCESS_TOKEN: false,
    ACCESS_TOKEN: null
};

module.exports = config;
