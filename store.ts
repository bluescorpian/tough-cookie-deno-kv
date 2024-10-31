import {
	Store,
	Cookie,
	type Nullable,
	type CreateCookieOptions,
	type SerializedCookie,
	permuteDomain,
	pathMatch,
} from "tough-cookie";

export class DenoKVStore extends Store {
	constructor(private kv: Deno.Kv, private prefix: string[]) {
		super();
		this.synchronous = false;
	}
	override async findCookie(
		domain: Nullable<string>,
		path: Nullable<string>,
		key: Nullable<string>
	): Promise<Cookie | undefined> {
		if (domain == null || path == null || key == null) {
			return undefined;
		}
		const result = await this.kv.get(
			this.prefix.concat([domain, path, key]) // idk how I am suppose to handle null values
		);
		return result.value ? Cookie.fromJSON(result.value) : undefined;
	}
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
				// NOTE: we should use path-match algorithm from S5.1.4 here
				// (see: https://github.com/ChromiumWebApps/chromium/blob/b3d3b4da8bb94c1b2e061600df106d590fda3620/net/cookies/canonical_cookie.cc#L299)
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
	override async putCookie(cookie: Cookie): Promise<void> {
		const { domain, path, key } = cookie;
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (domain == null || path == null || key == null) {
			return undefined;
		}

		// deno-lint-ignore no-unused-vars
		const result = await this.kv.set(
			this.prefix.concat([domain, path, key]),
			cookie.toJSON()
		); // TODO: handle not ok result

		return undefined;
	}
	override async removeAllCookies(): Promise<void> {
		const entries = this.kv.list<SerializedCookie>({ prefix: this.prefix });
		for await (const entry of entries) {
			await this.kv.delete(entry.key);
		}
	}
	override async removeCookie(
		domain: string,
		path: string,
		key: string
	): Promise<void> {
		await this.kv.delete(this.prefix.concat([domain, path, key]));
	}
	override async removeCookies(domain: string, path: string): Promise<void> {
		const entries = this.kv.list<SerializedCookie>({
			prefix: this.prefix.concat([domain, path]),
		});
		for await (const entry of entries) {
			await this.kv.delete(entry.key);
		}
	}
	override async updateCookie(
		_oldCookie: Cookie,
		newCookie: Cookie
	): Promise<void> {
		await this.putCookie(newCookie); // TODO: check if old value is equal to new value
	}
}

// TODO: implement atomic transactions
