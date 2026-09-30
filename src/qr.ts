import { styleText } from "node:util";
import * as qrcode from "qrcode";

export async function terminal(content: string): Promise<string> {
	const ansiQrString = await qrcode.toString(content)
	return styleText(["bgWhite", "black"], ansiQrString);
}

export type DataUrl = string;
export function dataUrl(content: string): Promise<DataUrl> {
	return qrcode.toDataURL(content);
}
