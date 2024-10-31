import {
	Store,
	Cookie,
	type Nullable,
	type CreateCookieOptions,
	type SerializedCookie,
	permuteDomain,
	pathMatch,
} from "tough-cookie";
import {
	createPromiseCallback,
	type Callback,
	type ErrorCallback,
} from "tough-cookie/dist/utils.js";

/**
 * DenoKVStore class for handling cookie storage within Deno's key-value store.
 * Extends the base {@link Store} class.
 *
 * @public
 */
export class DenoKVStore extends Store {
	constructor(private kv: Deno.Kv, private prefix: string[]) {
		super();
		this.synchronous = false;
	}

	/**
	 * Retrieve a {@link Cookie} with the given `domain`, `path`, and `key` (`name`). The RFC maintains that exactly
	 * one of these cookies should exist in a store. If the store is using versioning, this means that the latest or
	 * newest such cookie should be returned.
	 *
	 * @param domain - The cookie domain to match against.
	 * @param path - The cookie path to match against.
	 * @param key - The cookie name to match against.
	 */
	override findCookie(
		domain: Nullable<string>,
		path: Nullable<string>,
		key: Nullable<string>
	): Promise<Cookie | undefined>;
	/**
	 * Retrieve a {@link Cookie} with the given `domain`, `path`, and `key` (`name`). The RFC maintains that exactly
	 * one of these cookies should exist in a store. If the store is using versioning, this means that the latest or
	 * newest such cookie should be returned.
	 *
	 * @param domain - The cookie domain to match against.
	 * @param path - The cookie path to match against.
	 * @param key - The cookie name to match against.
	 * @param callback - A function to call with either the found cookie or an error.
	 */
	override findCookie(
		domain: Nullable<string>,
		path: Nullable<string>,
		key: Nullable<string>,
		callback: Callback<Cookie | undefined>
	): void;
	override async findCookie(
		domain: Nullable<string>,
		path: Nullable<string>,
		key: Nullable<string>,
		cb?: Callback<Cookie | undefined>
	): Promise<Cookie | undefined> {
		const promiseCallback = createPromiseCallback(cb);
		if (domain == null || path == null || key == null) {
			return promiseCallback.resolve(undefined);
		}
		try {
			const result = await this.kv.get(
				this.prefix.concat([domain, path, key])
			);
			return promiseCallback.resolve(
				result.value ? Cookie.fromJSON(result.value) : undefined
			);
		} catch (err) {
			return promiseCallback.reject(err as Error);
		}
	}

	/**
	 * Locates all {@link Cookie} values matching the given `domain` and `path`.
	 *
	 * The resulting list is checked for applicability to the current request
	 * according to the RFC (`domain-match`, `path-match`, `http-only-flag`, `secure-flag`, `expiry`, and so on).
	 *
	 * @param domain - The cookie domain to match against.
	 * @param path - The cookie path to match against. If `null`, retrieves cookies for all paths.
	 * @param allowSpecialUseDomain - If `true`, special-use domain suffixes will be allowed in matches.
	 */
	override findCookies(
		domain: Nullable<string>,
		path: Nullable<string>,
		allowSpecialUseDomain?: boolean
	): Promise<Cookie[]>;
	/**
	 * Locates all {@link Cookie} values matching the given `domain` and `path`.
	 *
	 * The resulting list is checked for applicability to the current request
	 * according to the RFC (`domain-match`, `path-match`, `http-only-flag`, `secure-flag`, `expiry`, and so on).
	 *
	 * @param domain - The cookie domain to match against.
	 * @param path - The cookie path to match against. If `null`, retrieves cookies for all paths.
	 * @param allowSpecialUseDomain - If `true`, special-use domain suffixes will be allowed in matches.
	 * @param callback - A function to call with either the found cookies or an error.
	 */
	override findCookies(
		domain: Nullable<string>,
		path: Nullable<string>,
		allowSpecialUseDomain: boolean,
		callback: Callback<Cookie[]>
	): void;
	override findCookies(
		domain: Nullable<string>,
		path: Nullable<string>,
		callback: Callback<Cookie[]>
	): void;
	override async findCookies(
		domain: Nullable<string>,
		path: Nullable<string>,
		allowSpecialUseDomain?: boolean | Callback<Cookie[]>,
		cb?: Callback<Cookie[]>
	): Promise<Cookie[]> {
		let callback: Callback<Cookie[]> | undefined = cb;
		if (typeof allowSpecialUseDomain === "function") {
			callback = allowSpecialUseDomain;
			allowSpecialUseDomain = true;
		}
		const promiseCallback = createPromiseCallback(callback);

		const results: Cookie[] = [];

		if (!domain) {
			return promiseCallback.resolve([]);
		}

		let pathMatcher: (
			domainIndex: Deno.KvListIterator<CreateCookieOptions>
		) => Promise<void>;

		if (!path) {
			// null means "all paths"
			pathMatcher = async function matchAll(domainIndex): Promise<void> {
				for await (const entry of domainIndex) {
					if (entry.value) {
						const cookie = Cookie.fromJSON(entry.value);
						if (cookie) results.push(cookie);
					}
				}
			};
		} else {
			pathMatcher = async (domainIndex): Promise<void> => {
				for await (const entry of domainIndex) {
					const cookiePath = entry.key
						.slice(this.prefix.length)[1]
						.toString();
					if (entry.value && pathMatch(path, cookiePath)) {
						const cookie = Cookie.fromJSON(entry.value);
						if (cookie) results.push(cookie);
					}
				}
			};
		}

		try {
			const domains = permuteDomain(
				domain,
				allowSpecialUseDomain as boolean
			) || [domain];
			for (const curDomain of domains) {
				const domainIndex = await this.kv.list<SerializedCookie>({
					prefix: this.prefix.concat([curDomain]),
				});
				await pathMatcher(domainIndex);
			}
			return promiseCallback.resolve(results);
		} catch (err) {
			return promiseCallback.reject(err as Error);
		}
	}

	/**
	 * Gets all the cookies in the store.
	 *
	 * @remarks
	 * - Cookies SHOULD be returned in creation order to preserve sorting.
	 */
	override getAllCookies(): Promise<Cookie[]>;
	/**
	 * Gets all the cookies in the store.
	 *
	 * @remarks
	 * - Cookies SHOULD be returned in creation order to preserve sorting.
	 * @param callback - A function to call with either the retrieved cookies or an error.
	 */
	override getAllCookies(callback: Callback<Cookie[]>): void;
	override async getAllCookies(cb?: Callback<Cookie[]>): Promise<Cookie[]> {
		const promiseCallback = createPromiseCallback(cb);
		const cookies: Cookie[] = [];

		try {
			const iterator = this.kv.list<SerializedCookie>({
				prefix: this.prefix,
			});

			for await (const entry of iterator) {
				if (entry.value) {
					const cookie = Cookie.fromJSON(entry.value);
					if (cookie) cookies.push(cookie);
				}
			}
			return promiseCallback.resolve(cookies);
		} catch (err) {
			return promiseCallback.reject(err as Error);
		}
	}

	/**
	 * Adds a new {@link Cookie} to the store. The implementation replaces any existing cookie with the same `domain`,
	 * `path`, and `key` properties.
	 *
	 * @param cookie - The cookie to store.
	 */
	override putCookie(cookie: Cookie): Promise<void>;
	/**
	 * Adds a new {@link Cookie} to the store. The implementation replaces any existing cookie with the same `domain`,
	 * `path`, and `key` properties.
	 *
	 * @param cookie - The cookie to store.
	 * @param callback - A function to call with an error if one occurred.
	 */
	override putCookie(cookie: Cookie, callback: ErrorCallback): void;
	override async putCookie(
		cookie: Cookie,
		cb?: ErrorCallback
	): Promise<void> {
		const promiseCallback = createPromiseCallback<void>(cb);
		const { domain, path, key } = cookie;
		if (domain == null || path == null || key == null) {
			return promiseCallback.resolve(undefined);
		}

		try {
			await this.kv.set(
				this.prefix.concat([domain, path, key]),
				cookie.toJSON()
			);
			return promiseCallback.resolve(undefined);
		} catch (err) {
			return promiseCallback.reject(err as Error);
		}
	}

	/**
	 * Removes all cookies from the store.
	 */
	override removeAllCookies(): Promise<void>;
	/**
	 * Removes all cookies from the store.
	 * @param callback - A function to call with an error if one occurred.
	 */
	override removeAllCookies(callback: ErrorCallback): void;
	override async removeAllCookies(cb?: ErrorCallback): Promise<void> {
		const promiseCallback = createPromiseCallback<void>(cb);
		try {
			const entries = this.kv.list<SerializedCookie>({
				prefix: this.prefix,
			});
			for await (const entry of entries) {
				await this.kv.delete(entry.key);
			}
			return promiseCallback.resolve(undefined);
		} catch (err) {
			return promiseCallback.reject(err as Error);
		}
	}

	/**
	 * Remove a cookie from the store.
	 *
	 * @param domain - The cookie domain to match against.
	 * @param path - The cookie path to match against.
	 * @param key - The cookie name to match against.
	 */
	override removeCookie(
		domain: string,
		path: string,
		key: string
	): Promise<void>;
	/**
	 * Remove a cookie from the store.
	 *
	 * @param domain - The cookie domain to match against.
	 * @param path - The cookie path to match against.
	 * @param key - The cookie name to match against.
	 * @param callback - A function to call with an error if one occurred.
	 */
	override removeCookie(
		domain: string,
		path: string,
		key: string,
		callback: ErrorCallback
	): void;
	override async removeCookie(
		domain: string,
		path: string,
		key: string,
		cb?: ErrorCallback
	): Promise<void> {
		const promiseCallback = createPromiseCallback<void>(cb);
		try {
			await this.kv.delete(this.prefix.concat([domain, path, key]));
			return promiseCallback.resolve(undefined);
		} catch (err) {
			return promiseCallback.reject(err as Error);
		}
	}

	/**
	 * Removes matching cookies from the store. If `path` is omitted, all paths in a domain will be removed.
	 *
	 * @param domain - The cookie domain to match against.
	 * @param path - The cookie path to match against.
	 */
	override removeCookies(domain: string, path: string): Promise<void>;
	/**
	 * Removes matching cookies from the store. If `path` is omitted, all paths in a domain will be removed.
	 *
	 * @param domain - The cookie domain to match against.
	 * @param path - The cookie path to match against.
	 * @param callback - A function to call with an error if one occurred.
	 */
	override removeCookies(
		domain: string,
		path: string,
		callback: ErrorCallback
	): void;
	override async removeCookies(
		domain: string,
		path: string,
		cb?: ErrorCallback
	): Promise<void> {
		const promiseCallback = createPromiseCallback<void>(cb);
		try {
			const entries = this.kv.list<SerializedCookie>({
				prefix: this.prefix.concat([domain, path]),
			});
			for await (const entry of entries) {
				await this.kv.delete(entry.key);
			}
			return promiseCallback.resolve(undefined);
		} catch (err) {
			return promiseCallback.reject(err as Error);
		}
	}

	/**
	 * Update an existing {@link Cookie}. Replaces the `value` for a cookie with the same `domain`,
	 * `path`, and `key`.
	 *
	 * @param oldCookie - The existing cookie in the store.
	 * @param newCookie - The new cookie replacing the existing one.
	 */
	override updateCookie(oldCookie: Cookie, newCookie: Cookie): Promise<void>;
	/**
	 * Update an existing {@link Cookie}. Replaces the `value` for a cookie with the same `domain`,
	 * `path`, and `key`.
	 *
	 * @param oldCookie - The existing cookie in the store.
	 * @param newCookie - The new cookie replacing the existing one.
	 * @param callback - A function to call with an error if one occurred.
	 */
	override updateCookie(
		oldCookie: Cookie,
		newCookie: Cookie,
		callback: ErrorCallback
	): void;
	override updateCookie(
		_oldCookie: Cookie,
		newCookie: Cookie,
		callback?: ErrorCallback
	): unknown {
		// updateCookie() may avoid updating cookies that are identical.  For example,
		// lastAccessed may not be important to some stores and an equality
		// comparison could exclude that field.
		// Don't return a value when using a callback, so that the return type is truly "void"
		if (callback) this.putCookie(newCookie, callback);
		else return this.putCookie(newCookie);
	}
}
