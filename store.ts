import {
	Store,
	Cookie,
	type Nullable,
	type CreateCookieOptions,
	type SerializedCookie,
	permuteDomain,
	pathMatch,
} from "tough-cookie";

/**
 * DenoKVStore class for handling cookie storage within Deno's key-value store.
 * Extends the base {@link Store} class.
 *
 * This store can be used asynchronously and implements all required cookie
 * management methods, including find, remove, and update cookies.
 *
 * @public
 */
export class DenoKVStore extends Store {
	constructor(private kv: Deno.Kv, private prefix: string[]) {
		super();
		this.synchronous = false;
	}

	/**
	 * Retrieve a {@link Cookie} with the given `domain`, `path`, and `key` (`name`).
	 *
	 * The RFC maintains that exactly one of these cookies should exist in a store.
	 * If the store is using versioning, this means that the latest or newest such cookie
	 * should be returned.
	 *
	 * @param domain - The cookie domain to match against.
	 * @param path - The cookie path to match against.
	 * @param key - The cookie name to match against.
	 * @returns The matching cookie, or `undefined` if none is found.
	 */
	override async findCookie(
		domain: Nullable<string>,
		path: Nullable<string>,
		key: Nullable<string>
	): Promise<Cookie | undefined> {
		if (domain == null || path == null || key == null) {
			return undefined;
		}
		const result = await this.kv.get(
			this.prefix.concat([domain, path, key])
		);
		return result.value ? Cookie.fromJSON(result.value) : undefined;
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
	 * @returns Array of matching cookies.
	 */
	override async findCookies(
		domain: Nullable<string>,
		path: Nullable<string>,
		allowSpecialUseDomain?: boolean
	): Promise<Cookie[]> {
		const results: Cookie[] = [];

		if (!domain) {
			return [];
		}

		let pathMatcher: (
			domainIndex: Deno.KvListIterator<CreateCookieOptions>
		) => Promise<void>;

		if (!path) {
			// null means "all paths"
			pathMatcher = async function matchAll(domainIndex): Promise<void> {
				for await (const entry of domainIndex) {
					if (entry.value) {
						results.push(new Cookie(entry.value));
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
						results.push(new Cookie(entry.value));
					}
				}
			};
		}

		const domains = permuteDomain(domain, allowSpecialUseDomain) || [
			domain,
		];
		for (const curDomain of domains) {
			const domainIndex = await this.kv.list<SerializedCookie>({
				prefix: this.prefix.concat([curDomain]),
			});
			await pathMatcher(domainIndex);
		}

		return results;
	}

	/**
	 * Gets all the cookies in the store.
	 *
	 * @remarks
	 * - Cookies SHOULD be returned in creation order to preserve sorting.
	 *
	 * @returns An array of all stored cookies.
	 */
	override async getAllCookies(): Promise<Cookie[]> {
		const cookies: Cookie[] = [];

		const iterator = this.kv.list<SerializedCookie>({
			prefix: this.prefix,
		});

		for await (const entry of iterator) {
			if (entry.value) {
				cookies.push(new Cookie(entry.value));
			}
		}
		return cookies;
	}

	/**
	 * Adds a new {@link Cookie} to the store. The implementation replaces any existing cookie with the same `domain`,
	 * `path`, and `key` properties.
	 *
	 * @param cookie - The cookie to store.
	 */
	override async putCookie(cookie: Cookie): Promise<void> {
		const { domain, path, key } = cookie;
		if (domain == null || path == null || key == null) {
			return undefined;
		}

		await this.kv.set(
			this.prefix.concat([domain, path, key]),
			cookie.toJSON()
		);
		return undefined;
	}

	/**
	 * Removes all cookies from the store.
	 */
	override async removeAllCookies(): Promise<void> {
		const entries = this.kv.list<SerializedCookie>({ prefix: this.prefix });
		for await (const entry of entries) {
			await this.kv.delete(entry.key);
		}
	}

	/**
	 * Remove a cookie from the store.
	 *
	 * @param domain - The cookie domain to match against.
	 * @param path - The cookie path to match against.
	 * @param key - The cookie name to match against.
	 */
	override async removeCookie(
		domain: string,
		path: string,
		key: string
	): Promise<void> {
		await this.kv.delete(this.prefix.concat([domain, path, key]));
	}

	/**
	 * Removes matching cookies from the store. If `path` is omitted, all paths in a domain will be removed.
	 *
	 * @param domain - The cookie domain to match against.
	 * @param path - The cookie path to match against.
	 */
	override async removeCookies(domain: string, path: string): Promise<void> {
		const entries = this.kv.list<SerializedCookie>({
			prefix: this.prefix.concat([domain, path]),
		});
		for await (const entry of entries) {
			await this.kv.delete(entry.key);
		}
	}

	/**
	 * Update an existing {@link Cookie}. Replaces the `value` for a cookie with the same `domain`,
	 * `path`, and `key`.
	 *
	 * @param _oldCookie - The existing cookie in the store.
	 * @param newCookie - The new cookie replacing the existing one.
	 */
	override async updateCookie(
		_oldCookie: Cookie,
		newCookie: Cookie
	): Promise<void> {
		await this.putCookie(newCookie);
	}
}

// TODO: implement atomic transactions
