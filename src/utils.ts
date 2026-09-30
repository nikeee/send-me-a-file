import fs from "node:fs/promises";
import type { NetworkInterfaceInfo } from "node:os";
import * as path from "node:path";
import { randomInt } from "node:crypto";

import type { IncomingMessage } from "node:http";


const cliUserAgentStarts = [
	"curl/",
	"Wget/",
	"HTTPie/",
]
export function isRequestingFromBrowser(req: IncomingMessage): boolean {
	const ua = req.headers["user-agent"] ?? "";
	return !cliUserAgentStarts.some(prefix => ua.startsWith(prefix));
}

export function isLoopback(iface: NetworkInterfaceInfo): boolean {
	return iface.internal;
}

export function readPublicFile(fileName: string): Promise<string> {
	const localPath = path.join(import.meta.dirname, "..", "public", fileName);
	return fs.readFile(localPath, { encoding: "utf8" });
}

export function indentText(text: string, char = "\t", amount = 1): string {
	const indent = char.repeat(amount);
	return text
		.split("\n")
		.map(l => indent + l)
		.join("\n");
}

export type Protocol = "http" | "https";

export function getServerUrlFromRequest(protocol: Protocol, req: IncomingMessage, token: string, defaultIncludingPort: string): string {
	const hostHeader = req.headers.host;

	if (hostHeader) {
		try {
			return new URL(`/${token}`, `${protocol}://${hostHeader}`).href;
		} catch {
			// Malformed host header, use default
		}
	}
	return `${protocol}://${defaultIncludingPort}`;
}

/**
 * Does not contain chars like 1/i/I/l and o/0/O
 */
const charset = "abcdefghjkmnpqrstuvwxyz123456789";

export function randomString(length: number = 8) {
	const res = new Array(length);

	for (let i = 0; i < res.length; ++i) {
		const c = charset[randomInt(charset.length)];
		res[i] = c;
	}
	return res.join("");
}

