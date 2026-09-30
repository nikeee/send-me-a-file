import * as os from "node:os";
import { parseArgs } from "node:util";
import * as fs from "node:fs/promises";

import { default as colors } from "colors";
import * as restify from "restify";
import * as errors from "restify-errors";
import type { File } from "formidable";
import { partial } from "filesize";

import * as qr from "./qr.js";
import { randomString, isLoopback, indentText, isRequestingFromBrowser, readPublicFile, type Protocol, getServerUrlFromRequest } from "./utils.js";

const helpText = `Usage: smaf <fileName> [options]

Arguments:
  fileName             Target file name.

Options:
  -p, --port           [number] [default: 8080]
      --maxFileSize    [number] [default: 10 GiB]
      --hashingFunction  Get a list via \`openssl list -digest-algorithms\` [default: "sha256"]
      --tempDir        Directory to store the file temporarily [default: os.tmpdir()]
      --noEmptyFiles   If the user uploads an empty file, dismiss it. [default: false]
      --overwrite      Overwrite <fileName> if it already exists. Use --no-overwrite to disable. [default: true]
      --noToken        Just use a link without any session-specific token.
      --token          The session-specific token to use. Will be generated randomly if omitted.
      --note           Leave a note for the sender. Will be displayed in the browser. [default: ""]
  -h, --help           Show help`;

function parseNumber(name: string, value: string): number {
	const n = Number(value);
	if (value.trim() === "" || Number.isNaN(n)) {
		exitWithError(`Invalid value for --${name}: ${value}`);
	}
	return n;
}

function exitWithError(message: string): never {
	console.error(`${helpText}\n\n${message}`);
	process.exit(1);
}

const { values, positionals } = (() => {
	try {
		return parseArgs({
			allowPositionals: true,
			allowNegative: true,
			options: {
				port: { type: "string", short: "p" },
				maxFileSize: { type: "string" },
				hashingFunction: { type: "string" },
				tempDir: { type: "string" },
				noEmptyFiles: { type: "boolean" },
				overwrite: { type: "boolean" },
				noToken: { type: "boolean" },
				token: { type: "string" },
				note: { type: "string" },
				help: { type: "boolean", short: "h" },
			},
		});
	} catch (e) {
		return exitWithError((e as Error).message);
	}
})();

if (values.help) {
	console.log(helpText);
	process.exit(0);
}

if (positionals.length !== 1) {
	exitWithError(positionals.length === 0 ? "Missing required argument: fileName" : "Too many arguments, expected exactly one fileName");
}

if (values.noToken && values.token !== undefined) {
	exitWithError("Arguments noToken and token are mutually exclusive");
}

const argv = {
	fileName: positionals[0]!,
	port: values.port === undefined ? 8080 : parseNumber("port", values.port),
	maxFileSize: values.maxFileSize === undefined ? 10 * 1024 * 1024 * 1024 : parseNumber("maxFileSize", values.maxFileSize), // 10GiB
	hashingFunction: values.hashingFunction ?? "sha256",
	tempDir: values.tempDir ?? os.tmpdir(),
	noEmptyFiles: values.noEmptyFiles ?? false,
	overwrite: values.overwrite ?? true,
	noToken: values.noToken,
	token: values.token,
	note: values.note ?? "",
};

const formatFileSize = partial({ standard: "iec" });

const token = argv.noToken ? "" : (argv.token ?? randomString());

const server = restify.createServer({
	name: "send-me-a-file",
});

const hashingFunction = argv.hashingFunction.toLowerCase();

const protocol: Protocol = "http";

server.use(restify.plugins.multipartBodyParser({
	hash: hashingFunction,
	maxFileSize: argv.maxFileSize,
	uploadDir: argv.tempDir,
	multiples: false,
}));

server.get("/:token", async (req, res, next) => {
	// TODO: Assertion function
	if (req.params.token !== token) {
		return next(new errors.BadRequestError("Invalid token provided."));
	}

	res.writeHead(200);

	if (isRequestingFromBrowser(req)) {
		const indexTemplate = await readPublicFile("index.html");

		const htmlNote = argv.note
			? `<h2>Note from receiver</h2>\n${argv.note}`
			: "";

		const href = getServerUrlFromRequest(protocol, req, token, "<script>document.write(document.location.href);</script>");

		const index = indexTemplate
		.replace(/%note%/gi, htmlNote)
		.replace(/%host%/gi, href);

		res.contentType = "text/html";
		res.end(index);
	} else {
		const note = argv.note
			? `\n${colors.dim("Note from the receiver:\n")}${colors.bold(argv.note)}`
			: "";

		const href = getServerUrlFromRequest(protocol, req, token, "<this address>:<port>");

		const content = [
			colors.yellow("Someone requested a file from you!"),
			"",
			colors.dim("You can simply use curl to upload it:"),
			`  ${colors.bold(`curl "${href}" -F file=@/path/to/file.zip`)}`,
			"",
			"...or open this URL in your browser.",
			note,
		].join("\n");

		res.contentType = "text/plain";
		res.end(`${indentText(content, "  ")}\n`);
	}
	return next();
});

interface UploadInfo {
	name: string;
	content: string | number | boolean | object | undefined;
}

server.post("/:token", async (req, res, next) => {
	// TODO: Assertion function
	if (req.params.token !== token) {
		return next(new errors.BadRequestError("Invalid token provided."));
	}

	// TODO: Enhance restify.RequestFileInterface
	const uploadedFile = req.files?.file as File | undefined;
	if (!uploadedFile) { // TODO: Assertion function
		return next(new errors.BadRequestError("No file uploaded"));
	}

	if (argv.noEmptyFiles && uploadedFile.size <= 0) {
		console.error("User uploaded an empty file, skipping.");
		return next(new errors.BadRequestError("Uploaded empty file."));
	}

	await checkForFileOverwrite(false);

	await fs.rename(uploadedFile.path, argv.fileName);

	console.log("Someone uploaded a file!");
	const info: UploadInfo[] = [
		{
			name: "Size",
			content: `${uploadedFile.size} bytes (${formatFileSize(uploadedFile.size)})`,
		}, {
			name: "Local path",
			content: argv.fileName,
		}, {
			name: "Client-Supplied file name",
			content: uploadedFile.name ?? undefined,
		}, {
			name: "Type",
			content: uploadedFile.type ?? undefined,
		}, {
			name: `${hashingFunction} hash`,
			 content: uploadedFile.hash ?? undefined,
		}, {
			name: "Last modified",
			 content: uploadedFile.lastModifiedDate ?? undefined,
		},
	];
	const longestKeyLength = Math.max(...info.map(i => i.name.length));

	console.log();
	for(const i of info) {
		console.log(formatInfo(i, longestKeyLength + 4));
	}

	console.log();
	console.log("Bye!");

	res.writeHead(200);

	if (isRequestingFromBrowser(req)) {
		res.contentType = "text/html";
		const thanks = await readPublicFile("thanks.html");
		res.end(thanks);
	} else {
		res.contentType = "text/plain";

		const info: UploadInfo[] = [
			{
				name: `${hashingFunction} hash of the file received`,
				content: uploadedFile.hash ?? undefined,
			}, {
				name: "Size",
				content: `${uploadedFile.size} bytes (${formatFileSize(uploadedFile.size)})`,
			},
		];

		const longestNameLength = Math.max(...info.map(i => i.name.length));

		const textReply = [
			colors.green("Thanks for the file!"),
			"",
			...info.map(i => formatInfo(i, longestNameLength + 4)),
			"",
			"Have a nice day!",
			"",
		].join("\n"); // We use this instead of `` because the line encoding of this file could change.

		res.end(textReply);
	}
	return process.exit();
});

// TODO: Implement these options:
// TODO: If dest-file-name is stdout, print file to stdout
// TODO: accept only same file extension
// TODO: TLS with public key pinning via curl
// TODO: Option to trust user-supplied file

async function main() {

	await checkForFileOverwrite(true);

	console.log("Starting local http server...");
	if (argv.tempDir !== os.tmpdir()) {
		console.log(`Using "${argv.tempDir}" as a temporary directory for file uploads.`);
	}
	console.log();

	server.listen(argv.port, async () => {
		const interfaces = os.networkInterfaces();

		const validInterfaces = Object.values(interfaces)
			.flat()
			.filter(iface => iface?.family === "IPv4");

		for(const iface of validInterfaces) {
			// biome-ignore lint/style/noNonNullAssertion: :shrug:
			await printEndpoint(protocol, iface!, argv.port, token);
		}

		console.log(colors.yellow(`Waiting for someone to upload ${colors.blue(argv.fileName)}`));
		console.log();
	});
}

main();


function formatInfo(info: UploadInfo, startPadding: number): string {
	const valueToPrint = typeof info.content === "undefined"
		? "<undefined>"
		: typeof info.content === "string"
			? info.content
			: info.content.toString();
	return colors.dim(`${info.name.padStart(startPadding)}: `) + colors.bold(valueToPrint);
}

async function printEndpoint(protocol: Protocol, iface: os.NetworkInterfaceInfo, port: number, token: string): Promise<void> {
	console.log(`  ${protocol}://${iface.address}:${colors.green(port.toString())}/${token}`);

	if (isLoopback(iface))
		return;

	// Don't print QRcodes to localhost
	const terimalQrCode = await qr.terminal(`${protocol}://${iface.address}:${port}/${token}`);
	const indentedQrCode = indentText(terimalQrCode, "    ");

	console.log();
	console.log(`    ${colors.dim("Upload via cURL:")}`);
	console.log(colors.bold(`    curl "${protocol}://${iface.address}:${port}/${token}" -F file=@/path/to/file.zip`));
	console.log();
	console.log(indentedQrCode);
	console.log();
}

async function checkForFileOverwrite(print: boolean) {

	const fileExists = await fs.access(argv.fileName, fs.constants.F_OK | fs.constants.W_OK)
		.then(() => true)
		.catch(() => false)

	if (fileExists) {
		if (argv.overwrite) {
			print && console.warn(`File ${argv.fileName} already exists. It will be overridden.`);
		} else {
			print && console.warn(`File ${argv.fileName} already exists.`);
			return process.exit(-1);
		}
	}
}
