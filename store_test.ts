import {  assertEquals } from "@std/assert";
import { DenoKVStore } from "./store.ts";
import { Cookie, CookieJar } from "tough-cookie";

const PREFIX = ["cookies"];
const COOKIES = [
	Cookie.parse(
		"foo=bar; Domain=example.com; Path=/path; Max-Age=3600; Secure; HttpOnly"
	)!,
	Cookie.parse(
		"bar=baz; Domain=example.com; Path=/path; Max-Age=3600; Secure; HttpOnly"
	)!,
	Cookie.parse(
		"baz=qux; Domain=example.com; Path=/different; Max-Age=3600; Secure; HttpOnly"
	)!,
	Cookie.parse(
		"qux=quux; Domain=example.org; Path=/path; Max-Age=3600; Secure; HttpOnly"
	)!,
];

function createKV(): Promise<Deno.Kv> {
	return Deno.openKv(":memory:");
}

function createStore(kv: Deno.Kv, prefix = PREFIX): DenoKVStore {
	return new DenoKVStore(kv, prefix);
}

async function createTestCookies(store: DenoKVStore): Promise<void> {
	for (const cookie of COOKIES) {
		await store.putCookie(cookie);
	}
}

Deno.test("findCookie", async () => {
	using kv = await createKV();
	const store = createStore(kv);
	await createTestCookies(store);
	const cookie = await store.findCookie("example.com", "/path", "foo");
	assertEquals(cookie?.toJSON(), COOKIES[0]?.toJSON());
});

Deno.test("findCookies", async () => {
	using kv = await createKV();
	const store = createStore(kv);
	await createTestCookies(store);
	const cookies = await store.findCookies("example.com", "/path");
	assertEquals(cookies.length, 2);
});

Deno.test("findCookies without path", async () => {
	using kv = await createKV();
	const store = createStore(kv);
	await createTestCookies(store);
	const cookies = await store.findCookies("example.com", null);
	assertEquals(cookies.length, 3);
});

Deno.test("findCookies with different path", async () => {
	using kv = await createKV();
	const store = createStore(kv);
	await createTestCookies(store);

	const cookies = await store.findCookies("example.com", "/different");
	assertEquals(cookies.length, 1);
});

Deno.test("getAllCookies", async () => {
	using kv = await createKV();
	const store = createStore(kv);
	await createTestCookies(store);
	const cookies = await store.getAllCookies();
	assertEquals(cookies.length, COOKIES.length);
});

Deno.test("putCookie", async () => {
	using kv = await createKV();
	const store = createStore(kv);
	await createTestCookies(store);
  const newCookie = Cookie.parse(
    "newKey=newValue; Domain=example.com; Path=/path; Max-Age=3600; Secure; HttpOnly"
  )!;
	await store.putCookie(newCookie);
	const cookies = await store.getAllCookies();
	assertEquals(cookies.length, COOKIES.length + 1);
	const cookie = await store.findCookie("example.com", "/path", "newKey");
	assertEquals(cookie?.toJSON(), newCookie.toJSON());
});

Deno.test("removeAllCookies", async () => {
	using kv = await createKV();
	const store = createStore(kv);
	await createTestCookies(store);
	await store.removeAllCookies();
	const cookies = await store.getAllCookies();
	assertEquals(cookies.length, 0);
});

Deno.test("removeCookie", async () => {
	using kv = await createKV();
	const store = createStore(kv);
	await createTestCookies(store);
	await store.removeCookie("example.com", "/path", "foo");
	const cookies = await store.getAllCookies();
	assertEquals(cookies.length, COOKIES.length - 1);
});

Deno.test("removeCookies", async () => {
	using kv = await createKV();
	const store = createStore(kv);
	await createTestCookies(store);
	await store.removeCookies("example.com", "/path");
	const cookies = await store.getAllCookies();
	assertEquals(cookies.length, COOKIES.length - 2);
});

Deno.test("updateCookie", async () => {
	using kv = await createKV();
	const store = createStore(kv);
	await createTestCookies(store);
	const newCookie = Cookie.parse(
		"foo=updated; Domain=example.com; Path=/path; Max-Age=3600; Secure; HttpOnly"
	)!;
	await store.updateCookie(newCookie, newCookie);
	const cookies = await store.getAllCookies();
	assertEquals(cookies.length, 4);
	const cookie = await store.findCookie("example.com", "/path", "foo");
	assertEquals(cookie?.toJSON(), newCookie.toJSON());
});

Deno.test("cookieJar", async () => {
	using kv = await createKV();
	const store = createStore(kv);
	await createTestCookies(store);
	const cookieJar = new CookieJar(store)

	const cookies = await cookieJar.getCookies("https://example.com/path");

	assertEquals(cookies.length, 2);

	await cookieJar.setCookie("newKey=newValue; Domain=example.com; Path=/path; Max-Age=3600; Secure; HttpOnly", "https://example.com/path");
	const newCookies = await cookieJar.getCookies("https://example.com/path");
	assertEquals(newCookies.length, 3);
})