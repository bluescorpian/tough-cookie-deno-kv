# tough-cookie-deno-kv-store

![Deno JS](https://img.shields.io/badge/deno%20js-000000?style=for-the-badge&logo=deno&logoColor=white)
[![JSR](https://jsr.io/badges/@bluescorpian/tough-cookie-deno-kv-store)](https://jsr.io/@bluescorpian/tough-cookie-deno-kv-store)
[![JSR Score](https://jsr.io/badges/@bluescorpian/tough-cookie-deno-kv-store/score)](https://jsr.io/@bluescorpian/tough-cookie-deno-kv-store)
[![codecov.io Code Coverage](https://img.shields.io/codecov/c/github/dwyl/hapi-auth-jwt2.svg?maxAge=2592000)](store_test.ts)

`tough-cookie-deno-kv-store` is a Deno KV store adapter for the `tough-cookie` library. This adapter allows you to store and manage cookies using Deno's key-value store.

## Installation

To install `tough-cookie-deno-kv-store`, use the following command:

```sh
deno add jsr:@bluescorpian/tough-cookie-deno-kv-store
```

or to use directly from JSR, import into a module:

```js
import { DenoKVStore } from "jsr:@bluescorpian/tough-cookie-deno-kv-store";
```

## Usage

```typescript
import { DenoKVStore } from "jsr:@bluescorpian/tough-cookie-deno-kv-store";
import { CookieJar } from "tough-cookie";

const kv = new Deno.Kv(); // Initialize your Deno KV instance
const store = new DenoKVStore(kv, ["cookie_prefix"]);
const cookieJar = new CookieJar(store);
```

## License

This project is licensed under the MIT License.
